import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, collection, getDocs, addDoc, deleteDoc, writeBatch, serverTimestamp, query, where, setDoc, limit, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Briefcase, Save, ArrowLeft, User, Car, MapPin, 
  Sparkles, AlertCircle, Trash2, Copy, Clipboard, Plus, CheckSquare,
  Wrench, Package, X, GripVertical, Edit2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { assignQCStaffToTask, assignQCStaffToJob } from '../../lib/auth/qcAssignment';
import { CustomerSelector, QuickAddCustomerModal } from './CustomerSelectionComponents';
import { VinSelector, QuickAddVehicleModal } from './VehicleSelector';

import { SearchableSelect } from './SearchableSelect';
import { InlineSearchableSelect } from './InlineSearchableSelect';
import { TaskTitleAutocomplete } from './TaskTitleAutocomplete';
import { projectWorkingHours } from './ScheduleBoard';
import { PartsRequestModal } from './PartsRequestModal';

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

export function JobEditPage({ tenantId }: { tenantId: string }) {
  const { '*': splat } = useParams();
  const pathParts = (splat || '').split('/').filter(Boolean);
  const jobId = pathParts[1];
  const isNew = jobId === 'create';
  
  const navigate = useNavigate();
  const { user, permissions, isSuperAdmin } = useAuthStore();
  
  // Permission gate
  if (!isSuperAdmin && !permissions['jobs.manage']) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Access Denied</h2>
        <p className="text-zinc-500 max-w-md mx-auto mt-2">
          You do not have the required permissions to edit job details. Please contact your administrator.
        </p>
        <button 
          onClick={() => navigate(-1)}
          className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold"
        >
          Go Back
        </button>
      </div>
    );
  }

  const [job, setJob] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [quickAddCustomer, setQuickAddCustomer] = useState<string | null>(null);
  const [quickAddVehicle, setQuickAddVehicle] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>(null);
  const [jobTasks, setJobTasks] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());

  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [qbItems, setQbItems] = useState<any[]>([]);
  const [taskDefaults, setTaskDefaults] = useState<Record<string, number>>({});
  const [parts, setParts] = useState<any[]>([]);
  const [isPartRequestOpen, setIsPartRequestOpen] = useState(false);
  const [selectedPartForEdit, setSelectedPartForEdit] = useState<any>(null);
  const [isCopyTasksOpen, setIsCopyTasksOpen] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [copiedTaskClipboard, setCopiedTaskClipboard] = useState<any>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, [isNew]);

  // Reset tasksLoaded and jobTasks when jobId changes to prevent race conditions
  useEffect(() => {
    setTasksLoaded(false);
    setJobTasks([]);
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !tenantId || isNew) return;
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('jobIds', 'array-contains', jobId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTimeLogs(logs);
    }, (err) => {
      console.error("Time logs listener error in JobEditPage:", err);
    });
    return () => unsub();
  }, [jobId, tenantId, isNew]);

  useEffect(() => {
    if (isNew || !jobId || !tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('jobId', '==', jobId)
    );
    const unsub = onSnapshot(q, (snap) => {
      setParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Parts requests listener error in JobEditPage:", err);
      setParts([]);
    });
    return () => unsub();
  }, [jobId, tenantId, isNew]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/staff`),
      orderBy('firstName', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setStaffList(
        snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((s: any) => !s.isArchived && !s.fireDate && s.departmentId && !s.isDeviceAccount)
      );
    }, (err) => {
      console.error("Staff list listener error in JobEditPage:", err);
    });
    return () => unsub();
  }, [tenantId]);

  const getTaskLoggedMs = (taskId: string) => {
    return timeLogs.reduce((acc, session) => {
      const taskSegments = (session.jobs || []).filter((j: any) => j.id === jobId && j.taskId === taskId);
      const segMs = taskSegments.reduce((segAcc: number, seg: any) => {
        const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
        const end = seg.end ? (seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime()) : now;
        return segAcc + Math.max(0, end - start);
      }, 0);
      return acc + segMs;
    }, 0);
  };

  const formatDatetimeLocal = (dateString?: any) => {
    if (!dateString) return '';
    const date = typeof dateString.toDate === 'function' ? dateString.toDate() : new Date(dateString);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  };

  useEffect(() => {
    if (!jobId || !tenantId) return;
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/jobs`, jobId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setJob({ id: snap.id, ...data });
        setFormData((prev: any) => ({
          title: data.title || '',
          jobNumber: data.jobNumber || '',
          status: data.status || 'Open',
          priority: data.priority || '3 - Medium',
          vehicleId: data.vehicleId || '',
          customerId: data.customerId || null,
          customerName: data.customerName || '',
          notes: data.notes || '',
          scheduledArrivalTime: formatDatetimeLocal(data.scheduledArrivalTime),
          expectedFinishTime: formatDatetimeLocal(data.expectedFinishTime),
          scheduledStartDate: formatDatetimeLocal(data.scheduledStartDate),
          scheduledEndDate: formatDatetimeLocal(data.scheduledEndDate),
          bayId: data.bayId || '',
          estimatedHours: data.estimatedHours || '',
          assignedStaff: data.assignedStaff || [],
          currentZoneId: prev?.currentZoneId !== undefined ? prev.currentZoneId : undefined,
          companyCamId: data.companyCamId || ''
        }));
      }
    }, (err) => console.error("Job header listener error:", err));
    return () => unsub();
  }, [jobId, tenantId, isNew]);

  // Initial form data for new jobs
  useEffect(() => {
    if (!isNew || !tenantId) return;
    setJob({ id: 'create', title: 'New Job' });
    setFormData({
      title: '',
      jobNumber: '',
      status: 'Open',
      priority: '3 - Medium',
      vehicleId: '',
      customerId: null,
      customerName: '',
      notes: '',
      scheduledArrivalTime: formatDatetimeLocal(new Date()),
      expectedFinishTime: '',
      scheduledStartDate: '',
      scheduledEndDate: '',
      bayId: '',
      estimatedHours: '',
      assignedStaff: [],
      currentZoneId: '',
      companyCamId: ''
    });
    setJobTasks([]);
    setTasksLoaded(true);
  }, [isNew, tenantId]);

  useEffect(() => {
    if (!jobId || !tenantId || isNew) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), (snap) => {
      setJobTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTasksLoaded(true);
    }, (err) => console.error("Job tasks listener error:", err));
    return () => unsub();
  }, [jobId, tenantId]);

  // Deduplicate "General" task if duplicates exist
  useEffect(() => {
    if (!jobId || !tenantId || !job || !tasksLoaded) return;
    
    const generalTasks = jobTasks.filter(t => isGeneralTask(t));
    
    if (generalTasks.length > 1) {
      const deleteExtraGenerals = async () => {
        try {
          // Keep the first one, delete the rest
          const extras = generalTasks.slice(1);
          for (const extra of extras) {
            await deleteDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, extra.id));
          }
          toast.success(`Deduplicated ${extras.length} duplicate General task(s)`);
        } catch (err) {
          console.error('Failed to deduplicate General tasks:', err);
        }
      };
      deleteExtraGenerals();
    }
  }, [jobTasks, tasksLoaded, jobId, tenantId, !!job]);

  // SYNC: Keep job-level assignedStaffIds in sync with task-level assignments
  useEffect(() => {
    if (isNew || !jobId || !tenantId || !tasksLoaded || !job) return;
    
    const allAssignedIds = Array.from(new Set(
      jobTasks.flatMap(t => t.assignedStaffIds || [])
    ));
    
    const currentJobIds = job.assignedStaffIds || [];
    const hasMismatch = allAssignedIds.length !== currentJobIds.length || 
                        !allAssignedIds.every(id => currentJobIds.includes(id));
                        
    if (hasMismatch) {
      const syncJobTechs = async () => {
        try {
          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
            assignedStaffIds: allAssignedIds,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.error("Tech sync error:", err);
        }
      };
      syncJobTechs();
    }
  }, [jobTasks, jobId, tenantId, job, tasksLoaded, isNew]);  const prevTasksStateRef = useRef<string>('');

  // Progression & Regression Logic Hook
  useEffect(() => {
    if (!jobTasks.length || !job || !tenantId || !jobId) return;

    const nonGeneralTasks = jobTasks.filter(t => !isGeneralTask(t));
    if (nonGeneralTasks.length === 0) return;

    const allQCReady = nonGeneralTasks.every(t => t.status === 'QC' || t.status === 'QC Complete');
    const allQCComplete = nonGeneralTasks.every(t => t.status === 'QC Complete');

    // Check if tasks actually changed
    const currentTasksState = nonGeneralTasks.map(t => `${t.id}:${t.status}`).join(',');
    const tasksChanged = prevTasksStateRef.current && prevTasksStateRef.current !== currentTasksState;
    prevTasksStateRef.current = currentTasksState;

    const updateJobStatus = async (newStatus: string, msg: string, isReversion = false) => {
      if (job.status === newStatus) return;
      try {
        const updateFields: any = {
          status: newStatus,
          updatedAt: new Date()
        };
        if (newStatus === 'Ready for Customer') {
          updateFields.readyForCustomerAt = new Date();
        } else if (['Completed', 'Closed'].includes(newStatus)) {
          updateFields.completedAt = new Date();
        } else if (['Active', 'Open', 'Ready for QC'].includes(newStatus)) {
          updateFields.readyForCustomerAt = null;
          updateFields.completedAt = null;
        }
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), updateFields);
        if (isReversion) {
          toast.error(msg);
        } else {
          toast.success(msg);
        }

        // Automatically assign job to QC staff if status is Ready for QC
        if (newStatus === 'Ready for QC') {
          await assignQCStaffToJob(tenantId, jobId);
        }
      } catch (e) {
        console.error("Auto-progression/regression error:", e);
      }
    };

    // Only auto-progress or auto-revert if tasks actually changed to avoid manual status change revert loops
    if (tasksChanged) {
      // Progression: If Active/Open/Ready for QC, progress forward if all tasks are ready
      if (['Active', 'Open', 'Ready for QC'].includes(job.status || '')) {
        if (allQCComplete) {
          updateJobStatus('Ready for Customer', 'Job ready for customer!');
        } else if (allQCReady) {
          updateJobStatus('Ready for QC', 'Job ready for QC inspection');
        }
      }

      // Regression: If currently Ready for Customer or Ready for QC, but tasks were reopened or added
      if (['Ready for Customer', 'Ready for QC'].includes(job.status || '')) {
        if (!allQCReady) {
          // There are unfinished tasks, so job must go back to Active
          updateJobStatus('Active', 'Tasks reopened: Job status set to Active', true);
        } else if (job.status === 'Ready for Customer' && !allQCComplete) {
          // All tasks are at least QC Ready, but not all are QC Complete, so job must go back to QC pending
          updateJobStatus('Ready for QC', 'QC tasks pending: Job status reverted', true);
        }
      }
    }
  }, [jobTasks, job?.status, tenantId, jobId]);



  useEffect(() => {
    getDocs(collection(db, `businesses/${tenantId}/vehicles`)).then(snap => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    getDocs(collection(db, `businesses/${tenantId}/zones`)).then(snap => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setZonesLoaded(true);
    });
    getDocs(collection(db, `businesses/${tenantId}/departments`)).then(snap => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    getDocs(collection(db, `businesses/${tenantId}/task_defaults`)).then(snap => {
      const defaults: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.title && typeof data.bookTime === 'number') {
          defaults[data.title] = data.bookTime;
        }
      });
      setTaskDefaults(defaults);
    }).catch(err => console.error("Failed to load task defaults:", err));

    Promise.all([
      getDocs(collection(db, `businesses/${tenantId}/qb_items`)),
      getDocs(collection(db, `businesses/${tenantId}/native_tasks`))
    ]).then(([qbSnap, nativeSnap]) => {
      const qb = qbSnap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'QuickBooks' }));
      const native = nativeSnap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'Native' }));
      const serviceItems = qb.filter((item: any) => 
        item.Type === 'Service' || 
        item.ItemType === 'Service' ||
        !item.Type
      );
      setQbItems([...serviceItems, ...native]);
    }).catch(err => console.error("Failed to load task items:", err));
  }, [tenantId]);

  // Sync initial zone once zones are loaded
  useEffect(() => {
    if (!isNew && jobId && zonesLoaded && formData && formData.currentZoneId === undefined) {
      const zone = zones.find(z => z.currentJobId === jobId);
      setFormData((prev: any) => ({ ...prev, currentZoneId: zone ? zone.id : '' }));
    } else if (isNew && formData && formData.currentZoneId === undefined) {
      setFormData((prev: any) => ({ ...prev, currentZoneId: '' }));
    }
  }, [zonesLoaded, formData, jobId, isNew, zones]);

  const handleSave = async () => {
    if (!formData || isSaving) return;
    setIsSaving(true);
    try {
      const { expectedFinishTime, scheduledArrivalTime, scheduledStartDate, scheduledEndDate, currentZoneId, ...rest } = formData;
      const payload: any = {
        ...rest,
        expectedFinishTime: expectedFinishTime ? new Date(expectedFinishTime).toISOString() : null,
        scheduledArrivalTime: scheduledArrivalTime ? new Date(scheduledArrivalTime).toISOString() : null,
        scheduledStartDate: scheduledStartDate ? new Date(scheduledStartDate).toISOString() : null,
        scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate).toISOString() : null,
        estimatedHours: jobTasks.filter(t => !isGeneralTask(t)).reduce((acc, t) => acc + (t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0)), 0),
        departmentIds: Array.from(new Set(jobTasks.map(t => t.departmentId).filter(Boolean))),
        updatedAt: new Date()
      };

      if (formData.status !== job?.status) {
        if (formData.status === 'Ready for Customer') {
          payload.readyForCustomerAt = new Date();
        } else if (['Completed', 'Closed'].includes(formData.status)) {
          payload.completedAt = new Date();
        } else if (['Active', 'Open', 'Ready for QC'].includes(formData.status)) {
          payload.readyForCustomerAt = null;
          payload.completedAt = null;
        }
      }

      let finalJobId = jobId;
      if (isNew) {
        const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs`), {
          ...payload,
          createdAt: serverTimestamp()
        });
        finalJobId = docRef.id;

        // Create initial tasks
        const tasksBatch = writeBatch(db);
        jobTasks.forEach(task => {
          const taskRef = doc(collection(db, `businesses/${tenantId}/jobs/${finalJobId}/tasks`));
          const { id, ...taskData } = task;
          tasksBatch.set(taskRef, {
            ...taskData,
            assignedStaffIds: (taskData.assignedStaff || []).map((s: any) => s.id),
            tenantId: tenantId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });
        await tasksBatch.commit();
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), payload);
      }

      // Zone Assignment Logic
      const previousZone = zones.find(z => z.currentJobId === finalJobId);
      if (previousZone && previousZone.id !== currentZoneId) {
        // Clear from old zone
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, previousZone.id), {
          currentJobId: null,
          currentVehicleVin: null,
          updatedAt: serverTimestamp()
        });
      }

      if (currentZoneId && (!previousZone || previousZone.id !== currentZoneId)) {
        // Assign to new zone
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, currentZoneId), {
          currentJobId: finalJobId,
          currentVehicleVin: formData.vehicleId || null,
          lastAssignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // --- Cascade Logic ---
      if (payload.bayId && payload.scheduledStartDate) {
        try {
          const cascadeBatch = writeBatch(db);
          const qJobs = query(
            collection(db, `businesses/${tenantId}/jobs`),
            where('bayId', '==', payload.bayId)
          );
          const snap = await getDocs(qJobs);
          const otherJobsInBay = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter((j: any) => j.id !== finalJobId && j.scheduledStartDate && parseFloat(j.estimatedHours || '0') > 0);
          
          const droppedStartTime = new Date(payload.scheduledStartDate).getTime();
          const jobsToPush = otherJobsInBay.filter((j: any) => new Date(j.scheduledStartDate).getTime() >= droppedStartTime);
          
          jobsToPush.sort((a: any, b: any) => new Date(a.scheduledStartDate).getTime() - new Date(b.scheduledStartDate).getTime());
          
          if (payload.scheduledEndDate) {
            let currentEndTime = new Date(payload.scheduledEndDate);
            
            // Get department schedule
            const bayObj = zones.find(z => z.id === payload.bayId || z.name === payload.bayId);
            const dept = departments.find(d => d.id === bayObj?.departmentId);

            for (const otherJob of jobsToPush) {
              // Calculate the 10-minute buffer start time (respecting working hours)
              const bufferStart = currentEndTime;
              const gapEnd = projectWorkingHours(bufferStart, 10 / 60, dept?.defaultSchedule);
              
              const otherEstHours = parseFloat(otherJob.estimatedHours) || 1;
              const otherNewEnd = projectWorkingHours(gapEnd, otherEstHours, dept?.defaultSchedule);
              
              const otherJobRef = doc(db, `businesses/${tenantId}/jobs`, otherJob.id);
              cascadeBatch.update(otherJobRef, {
                scheduledStartDate: gapEnd.toISOString(),
                scheduledEndDate: otherNewEnd.toISOString(),
                updatedAt: serverTimestamp()
              });
              
              currentEndTime = otherNewEnd;
            }
            await cascadeBatch.commit();
          }
        } catch (err) {
          console.error("Cascade failed during save:", err);
        }
      }

      toast.success(isNew ? 'Job created successfully' : 'Job updated successfully');
      navigate(`/business/${tenantId}/job/${finalJobId}`);
    } catch (err) {
      console.error(err);
      toast.error(isNew ? 'Failed to create job' : 'Failed to update job');
    } finally {
      setIsSaving(false);
    }
  };

  const logActivity = async (type: string, message: string, metadata: any = {}) => {
    if (isNew) return;
    try {
      const activityData = {
        type,
        message,
        metadata,
        timestamp: new Date(),
        staffId: user?.uid,
        staffName: user?.displayName || user?.email || 'Staff'
      };

      // 1. Write to local subcollection
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), activityData);

      // 2. Write to global activity feed
      const jobPrefix = job ? (job.jobNumber ? `Job #${job.jobNumber}` : `Job ${job.title}`) : 'Job';
      const typeToTitle: Record<string, string> = {
        blocker_added: 'Blocker Added',
        blocker_resolved: 'Blocker Resolved',
        part_status_changed: 'Part Status Changed',
        location_changed: 'Vehicle Moved',
        patrol_check: 'Patrol Check',
        status_changed: 'Status Changed',
        task_added: 'Task Added',
        task_duplicated: 'Task Duplicated',
        task_deleted: 'Task Removed',
        task_updated: 'Task Updated',
        task_assigned: 'Task Assigned',
      };

      const getSeverity = (t: string, msg: string) => {
        if (t === 'blocker_added') return 'warning';
        if (t === 'blocker_resolved') return 'success';
        if (t === 'status_changed') {
          if (msg.toLowerCase().includes('blocked')) return 'error';
          if (msg.toLowerCase().includes('restored') || msg.toLowerCase().includes('active')) return 'success';
        }
        return 'info';
      };

      await setDoc(doc(db, `businesses/${tenantId}/activity_feed`, `job_act_${jobId}_${docRef.id}`), {
        type: 'job',
        title: typeToTitle[type] || 'Job Update',
        message: `${jobPrefix}: ${message}`,
        timestamp: activityData.timestamp,
        severity: getSeverity(type, message),
        author: activityData.staffName,
        metadata: {
          jobId,
          jobTitle: job?.title || '',
          jobNumber: job?.jobNumber || '',
          ...metadata
        }
      });
    } catch (err) {
      console.error("Activity logging error:", err);
    }
  };

  const copyTasksFromJob = async (sourceJobId: string) => {
    try {
      const tasksSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${sourceJobId}/tasks`));
      
      const sourceTasks = tasksSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(t => !isGeneralTask(t))
        .sort((a, b) => {
          const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
          const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
          if (aOrder !== bOrder) return aOrder - bOrder;
          
          const aTime = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0);
          const bTime = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0);
          return aTime - bTime;
        });

      const copiedTasks = sourceTasks.map(t => ({
        title: t.title || '',
        description: t.description || '',
        taskGroup: t.taskGroup || 'Uncategorized',
        departmentId: t.departmentId || '',
        bookTime: parseFloat(t.bookTime) || 0,
        payBasis: t.payBasis || 'book_time',
        status: 'pending',
        assignedStaff: [],
        assignedStaffIds: []
      }));

      if (copiedTasks.length === 0) {
        toast.error('No tasks found to copy in the selected job.');
        return;
      }

      if (isNew) {
        setJobTasks(prev => {
          const generalTasks = prev.filter(t => isGeneralTask(t));
          const nonGeneralTasks = prev.filter(t => !isGeneralTask(t));
          
          const maxSortOrder = nonGeneralTasks.reduce((max, t) => {
            const order = typeof t.sortOrder === 'number' ? t.sortOrder : 0;
            return order > max ? order : max;
          }, 0);

          const newTasksList = [
            ...generalTasks,
            ...nonGeneralTasks,
            ...copiedTasks.map((t, idx) => ({ 
              id: Math.random().toString(36).substr(2, 9), 
              ...t,
              sortOrder: maxSortOrder + 10 + (idx * 10)
            }))
          ];
          return newTasksList;
        });
        toast.success(`Copied ${copiedTasks.length} tasks successfully!`);
      } else {
        const maxSortOrder = jobTasks.reduce((max, t) => {
          const order = typeof t.sortOrder === 'number' ? t.sortOrder : 0;
          return order > max ? order : max;
        }, 0);

        const tasksBatch = writeBatch(db);
        copiedTasks.forEach((t, idx) => {
          const taskRef = doc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`));
          tasksBatch.set(taskRef, {
            ...t,
            sortOrder: maxSortOrder + 10 + (idx * 10),
            tenantId: tenantId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });
        await tasksBatch.commit();
        
        await logActivity('tasks_copied', `Copied ${copiedTasks.length} tasks from job ${sourceJobId}`);
        toast.success(`Copied ${copiedTasks.length} tasks successfully!`);
      }
    } catch (err) {
      console.error("Error copying tasks:", err);
      toast.error('Failed to copy tasks.');
    }
  };

  const updateMultipleTaskFields = async (taskId: string, sourceTask: any) => {
    const fieldsToCopy = {
      title: sourceTask.title || '',
      description: sourceTask.description || '',
      departmentId: sourceTask.departmentId || '',
      bookTime: sourceTask.bookTime || 0,
      payBasis: sourceTask.payBasis || 'book_time',
      assignedStaff: sourceTask.assignedStaff || [],
      assignedStaffIds: sourceTask.assignedStaffIds || [],
      canComplete: sourceTask.canComplete !== false
    };

    if (isNew) {
      setJobTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...fieldsToCopy } : t));
      toast.success('Row pasted');
    } else {
      try {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
          ...fieldsToCopy,
          updatedAt: serverTimestamp()
        });
        await logActivity('task_updated', `Pasted task data into task "${sourceTask.title}"`);
        toast.success('Row pasted');
      } catch (err) {
        console.error(err);
        toast.error('Failed to paste row');
      }
    }
  };

  const handlePasteAsNewTask = async (group: string) => {
    if (!copiedTaskClipboard) return;
    const newTask = {
      title: copiedTaskClipboard.title || '',
      description: copiedTaskClipboard.description || '',
      taskGroup: group,
      assignedStaff: copiedTaskClipboard.assignedStaff || [],
      assignedStaffIds: copiedTaskClipboard.assignedStaffIds || [],
      bookTime: copiedTaskClipboard.bookTime || 0,
      payBasis: copiedTaskClipboard.payBasis || 'book_time',
      status: 'pending',
      departmentId: copiedTaskClipboard.departmentId || '',
      canComplete: copiedTaskClipboard.canComplete !== false
    };

    if (isNew) {
      const tempId = Math.random().toString(36).substr(2, 9);
      setJobTasks(prev => [...prev, { id: tempId, ...newTask }]);
      toast.success('Pasted as new row');
    } else {
      try {
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), {
          ...newTask,
          tenantId: tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await logActivity('task_added', `Pasted new task to group: ${group}`);
        toast.success('Pasted as new row');
      } catch (err) {
        console.error(err);
        toast.error('Failed to paste as new row');
      }
    }
  };

  const focusNextRowCell = (input: HTMLElement, direction: 'up' | 'down') => {
    let tr = input.closest('tr');
    const td = input.closest('td');
    if (!tr || !td) return;
    
    const cellIndex = td.cellIndex;
    let targetInput: HTMLElement | null = null;
    
    while (tr) {
      tr = direction === 'down' ? tr.nextElementSibling as HTMLTableRowElement : tr.previousElementSibling as HTMLTableRowElement;
      if (!tr) {
        const currentTable = input.closest('table');
        if (currentTable) {
          const tables = Array.from(document.querySelectorAll('table'));
          const currentIdx = tables.indexOf(currentTable);
          const nextTable = direction === 'down' ? tables[currentIdx + 1] : tables[currentIdx - 1];
          if (nextTable) {
            const nextTrs = Array.from(nextTable.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
            if (nextTrs.length > 0) {
              tr = direction === 'down' ? nextTrs[0] : nextTrs[nextTrs.length - 1];
              const targetTd = tr.cells[cellIndex];
              const inputEl = targetTd?.querySelector('input:not([disabled]):not([readonly]), select:not([disabled])') as HTMLElement | null;
              if (inputEl) {
                targetInput = inputEl;
                break;
              }
            }
          }
        }
        break;
      }
      
      const targetTd = tr.cells[cellIndex];
      const inputEl = targetTd?.querySelector('input:not([disabled]):not([readonly]), select:not([disabled])') as HTMLElement | null;
      if (inputEl) {
        targetInput = inputEl;
        break;
      }
    }
    
    if (targetInput) {
      targetInput.focus();
      if (targetInput instanceof HTMLInputElement) {
        targetInput.select();
      }
    }
  };

  const focusSiblingCell = (input: HTMLElement, direction: 'left' | 'right') => {
    const tr = input.closest('tr');
    let td = input.closest('td');
    if (!tr || !td) return;
    
    let targetInput: HTMLElement | null = null;
    while (td) {
      td = direction === 'right' ? td.nextElementSibling as HTMLTableCellElement : td.previousElementSibling as HTMLTableCellElement;
      if (!td) break;
      
      const inputEl = td.querySelector('input:not([disabled]):not([readonly]), select:not([disabled])') as HTMLElement | null;
      if (inputEl) {
        targetInput = inputEl;
        break;
      }
    }
    
    if (targetInput) {
      targetInput.focus();
      if (targetInput instanceof HTMLInputElement) {
        targetInput.select();
      }
    }
  };

  const handleTableKeyDown = (
    e: React.KeyboardEvent<HTMLTableElement>, 
    group: string, 
    tasks: any[]
  ) => {
    if (e.defaultPrevented) return;
    
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT';
    const isSelect = target.tagName === 'SELECT';
    
    if (!isInput && !isSelect) return;
    
    const inputEl = target as HTMLInputElement | HTMLSelectElement;
    const tr = inputEl.closest('tr');
    const td = inputEl.closest('td');
    if (!tr || !td) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusNextRowCell(inputEl, 'down');
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusNextRowCell(inputEl, 'up');
        break;
      case 'ArrowLeft':
        if (isSelect || (isInput && (inputEl as HTMLInputElement).selectionStart === 0 && (inputEl as HTMLInputElement).selectionEnd === 0)) {
          e.preventDefault();
          focusSiblingCell(inputEl, 'left');
        }
        break;
      case 'ArrowRight':
        if (isSelect || (isInput && (inputEl as HTMLInputElement).selectionStart === (inputEl as HTMLInputElement).value.length)) {
          e.preventDefault();
          focusSiblingCell(inputEl, 'right');
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (!tr.nextElementSibling) {
          const staff = tasks.length > 0 && tasks[0].assignedStaff ? tasks[0].assignedStaff : [];
          const deptId = tasks.length > 0 ? tasks[0].departmentId : undefined;
          handleInlineAddTask(group, staff, deptId);
        } else {
          focusNextRowCell(inputEl, 'down');
        }
        break;
      case 'Tab':
        if (e.shiftKey) {
          e.preventDefault();
          let targetInput = null;
          let currentTd = td;
          while (currentTd) {
            currentTd = currentTd.previousElementSibling as HTMLTableCellElement;
            if (!currentTd) {
              const prevTr = tr.previousElementSibling as HTMLTableRowElement;
              if (prevTr) {
                const cells = Array.from(prevTr.cells).reverse();
                for (const cell of cells) {
                  const inputEl = cell.querySelector('input:not([disabled]):not([readonly]), select:not([disabled])') as HTMLElement | null;
                  if (inputEl) {
                    targetInput = inputEl;
                    break;
                  }
                }
              }
              break;
            }
            const inputEl = currentTd.querySelector('input:not([disabled]):not([readonly]), select:not([disabled])') as HTMLElement | null;
            if (inputEl) {
              targetInput = inputEl;
              break;
            }
          }
          if (targetInput) {
            targetInput.focus();
            if (targetInput instanceof HTMLInputElement) targetInput.select();
          }
        } else {
          e.preventDefault();
          let targetInput = null;
          let currentTd = td;
          while (currentTd) {
            currentTd = currentTd.nextElementSibling as HTMLTableCellElement;
            if (!currentTd) {
              const nextTr = tr.nextElementSibling as HTMLTableRowElement;
              if (nextTr) {
                const cells = Array.from(nextTr.cells);
                for (const cell of cells) {
                  const inputEl = cell.querySelector('input:not([disabled]):not([readonly]), select:not([disabled])') as HTMLElement | null;
                  if (inputEl) {
                    targetInput = inputEl;
                    break;
                  }
                }
              } else {
                const staff = tasks.length > 0 && tasks[0].assignedStaff ? tasks[0].assignedStaff : [];
                const deptId = tasks.length > 0 ? tasks[0].departmentId : undefined;
                handleInlineAddTask(group, staff, deptId);
              }
              break;
            }
            const inputEl = currentTd.querySelector('input:not([disabled]):not([readonly]), select:not([disabled])') as HTMLElement | null;
            if (inputEl) {
              targetInput = inputEl;
              break;
            }
          }
          if (targetInput) {
            targetInput.focus();
            if (targetInput instanceof HTMLInputElement) targetInput.select();
          }
        }
        break;
      default:
        break;
    }
  };

  const handleInlineAddTask = async (group: string, initialStaff: any[], initialDepartmentId?: string) => {
    const tempId = Math.random().toString(36).substr(2, 9);
    const newTask = {
      title: '',
      description: '',
      taskGroup: group,
      assignedStaff: initialStaff,
      assignedStaffIds: initialStaff.map(s => s.id),
      bookTime: 0,
      payBasis: 'book_time',
      status: 'pending',
      departmentId: initialDepartmentId || '',
      canComplete: true
    };

    if (isNew) {
      setJobTasks(prev => [...prev, { id: tempId, ...newTask }]);
      setTimeout(() => {
        const el = document.getElementById(`task-title-${tempId}`);
        el?.focus();
        if (el instanceof HTMLInputElement) el.select();
      }, 100);
    } else {
      try {
        const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), {
          ...newTask,
          tenantId: tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        await logActivity('task_added', `Added new task to group: ${group}`);
        
        // Real-time listener will pull it in, but we need to focus it.
        // We'll focus by docRef.id.
        setTimeout(() => {
          const el = document.getElementById(`task-title-${docRef.id}`);
          el?.focus();
          if (el instanceof HTMLInputElement) el.select();
        }, 500);
      } catch (err) {
        console.error(err);
        toast.error('Failed to add task');
      }
    }
  };

  const handleDuplicateTask = async (task: any) => {
    const { id, ...taskData } = task;
    const newTask = {
      ...taskData,
      status: 'pending',
      completedAt: null,
      actualTime: 0,
      isAccidental: false
    };

    if (isNew) {
      setJobTasks(prev => [...prev, { id: Date.now().toString(), ...newTask }]);
      toast.success('Task duplicated');
    } else {
      try {
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), {
          ...newTask,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await logActivity('task_duplicated', `Duplicated task: ${task.title || 'Unnamed Task'}`);
        toast.success('Task duplicated');
      } catch (err) {
        console.error(err);
        toast.error('Failed to duplicate task');
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to remove this task?')) return;
    const taskToDelete = jobTasks.find(t => t.id === taskId);
    if (isNew) {
      setJobTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Task removed');
    } else {
      try {
        // Clock out any active sessions on this task
        const activeSessionsToUpdate = timeLogs.filter(session => {
          const isSessionActive = session.status === 'active' || session.status === 'on_break';
          if (!isSessionActive) return false;
          return (session.jobs || []).some((j: any) => !j.end && j.id === jobId && j.taskId === taskId);
        });

        for (const session of activeSessionsToUpdate) {
          const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);
          const updatedJobs = (session.jobs || []).map((j: any) => {
            if (!j.end && j.id === jobId && j.taskId === taskId) {
              return { ...j, end: new Date() };
            }
            return j;
          });
          await updateDoc(sessionRef, {
            jobs: updatedJobs,
            updatedAt: serverTimestamp()
          });
        }

        await deleteDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId));
        await logActivity('task_deleted', `Removed task: ${taskToDelete?.title || 'Unnamed Task'}`);
        toast.success('Task removed');
      } catch (err) {
        console.error(err);
        toast.error('Failed to remove task');
      }
    }
  };

  const handleReorderTasks = async (draggedId: string, targetTaskId: string | null, targetGroup: string) => {
    if (draggedId === targetTaskId) return;
    
    // Find dragged task
    const draggedTask = jobTasks.find(t => t.id === draggedId);
    if (!draggedTask) return;

    // We will build a new array of tasks
    const updatedTasks = [...jobTasks];
    
    // Get all tasks in target group (excluding dragged task)
    const targetGroupTasks = updatedTasks
      .filter(t => t.taskGroup === targetGroup && t.id !== draggedId)
      .sort((a, b) => {
        const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
        const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        
        const aTime = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0);
        const bTime = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0);
        return aTime - bTime;
      });

    // Find target insertion index
    let insertIdx = targetGroupTasks.length; // default to end
    if (targetTaskId) {
      const idx = targetGroupTasks.findIndex(t => t.id === targetTaskId);
      if (idx !== -1) {
        insertIdx = idx;
      }
    }

    // Insert dragged task at insertIdx in the target group's task list
    const newDraggedTask = { 
      ...draggedTask, 
      taskGroup: targetGroup
    };
    
    targetGroupTasks.splice(insertIdx, 0, newDraggedTask);

    // Now, assign sequential sortOrders to targetGroupTasks
    const tasksToUpdate: any[] = [];
    targetGroupTasks.forEach((task, idx) => {
      const newOrder = idx * 10;
      if (task.sortOrder !== newOrder || (task.id === draggedId && (task.taskGroup !== draggedTask.taskGroup || task.sortOrder !== newOrder))) {
        task.sortOrder = newOrder;
        tasksToUpdate.push(task);
      }
    });

    // If the dragged task changed groups, we might also want to re-index the source group tasks to keep them clean
    if (draggedTask.taskGroup !== targetGroup) {
      const sourceGroupTasks = updatedTasks
        .filter(t => t.taskGroup === draggedTask.taskGroup && t.id !== draggedId)
        .sort((a, b) => {
          const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
          const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
          if (aOrder !== bOrder) return aOrder - bOrder;
          
          const aTime = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0);
          const bTime = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0);
          return aTime - bTime;
        });
      
      sourceGroupTasks.forEach((task, idx) => {
        const newOrder = idx * 10;
        if (task.sortOrder !== newOrder) {
          task.sortOrder = newOrder;
          tasksToUpdate.push(task);
        }
      });
    }

    // Update local state first for instant feedback
    setJobTasks(prev => {
      return prev.map(t => {
        const updated = tasksToUpdate.find(up => up.id === t.id);
        if (updated) {
          return { ...t, sortOrder: updated.sortOrder, taskGroup: updated.taskGroup };
        }
        if (t.id === draggedId) {
          return { ...t, taskGroup: targetGroup, sortOrder: newDraggedTask.sortOrder || 0 };
        }
        return t;
      });
    });

    // If not new, write to Firestore
    if (!isNew) {
      try {
        const promises = tasksToUpdate.map(async (task) => {
          const docRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, task.id);
          await updateDoc(docRef, {
            sortOrder: task.sortOrder,
            taskGroup: task.taskGroup,
            updatedAt: serverTimestamp()
          });
        });
        await Promise.all(promises);
        toast.success('Tasks reordered');
      } catch (err) {
        console.error('Failed to save reordered tasks:', err);
        toast.error('Failed to save task order');
      }
    } else {
      toast.success('Tasks reordered');
    }
  };

  const handleBulkAssignUnworked = async (staffId: string, fullName: string) => {
    const unworkedTasks = jobTasks.filter(t => {
      if (isGeneralTask(t)) return false;
      const loggedMs = getTaskLoggedMs(t.id);
      const hasActualTime = typeof t.actualTime === 'number' && t.actualTime > 0;
      return loggedMs === 0 && !hasActualTime;
    });

    if (unworkedTasks.length === 0) {
      toast.info('No unworked tasks found to assign.');
      return;
    }

    if (!confirm(`Are you sure you want to assign ${fullName} to all ${unworkedTasks.length} unworked tasks?`)) {
      return;
    }

    if (isNew) {
      setJobTasks(prev => prev.map(t => {
        const isUnworked = unworkedTasks.some(ut => ut.id === t.id);
        if (isUnworked) {
          return {
            ...t,
            assignedStaff: [{ id: staffId, name: fullName }],
            assignedStaffIds: [staffId]
          };
        }
        return t;
      }));
      toast.success(`Assigned ${fullName} to ${unworkedTasks.length} tasks locally.`);
    } else {
      try {
        const batch = writeBatch(db);
        unworkedTasks.forEach(t => {
          const docRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, t.id);
          batch.update(docRef, {
            assignedStaff: [{ id: staffId, name: fullName }],
            assignedStaffIds: [staffId],
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
        await logActivity('tasks_assigned_bulk', `Bulk assigned ${unworkedTasks.length} unworked tasks to ${fullName}`);
        toast.success(`Successfully assigned ${fullName} to ${unworkedTasks.length} tasks.`);
      } catch (err) {
        console.error('Failed to bulk assign tasks:', err);
        toast.error('Failed to bulk assign tasks.');
      }
    }
  };

  const updateTaskField = async (taskId: string, field: string, value: any) => {
    if (isNew) {
      if (field === 'title') {
        const defaultHours = taskDefaults[value];
        const isDiagRepair = value.toLowerCase().trim() === 'labor:diagnose/repair';
        const finalHours = typeof defaultHours === 'number' ? defaultHours : (isDiagRepair ? 1 : undefined);
        if (finalHours !== undefined) {
          setJobTasks(prev => prev.map(t => t.id === taskId ? { ...t, title: value, bookTime: finalHours, payBasis: 'book_time' } : t));
        } else {
          setJobTasks(prev => prev.map(t => t.id === taskId ? { ...t, title: value } : t));
        }
      } else if (field === 'completedAt') {
        setJobTasks(prev => prev.map(t => t.id === taskId ? { 
          ...t, 
          completedAt: value, 
          status: value ? 'QC' : 'pending',
          completedBy: value ? (user?.displayName || user?.email) : null,
          completedByStaffId: value ? user?.uid : null,
          completedByStaffName: value ? (user?.displayName || user?.email || 'Staff') : null
        } : t));
      } else if (field === 'status') {
        setJobTasks(prev => prev.map(t => t.id === taskId ? {
          ...t,
          status: value,
          completedAt: value === 'QC' ? (t.completedAt || new Date().toISOString()) : (value === 'pending' ? null : t.completedAt),
          completedBy: value === 'QC' ? (user?.displayName || user?.email) : (value === 'pending' ? null : t.completedBy),
          completedByStaffId: value === 'QC' ? user?.uid : (value === 'pending' ? null : t.completedByStaffId),
          completedByStaffName: value === 'QC' ? (user?.displayName || user?.email || 'Staff') : (value === 'pending' ? null : t.completedByStaffName)
        } : t));
      } else if (field === 'canComplete') {
        setJobTasks(prev => prev.map(t => t.id === taskId ? { 
          ...t, 
          canComplete: value,
          completedAt: value ? t.completedAt : null,
          status: value ? t.status : 'pending',
          completedBy: value ? t.completedBy : null,
          completedByStaffId: value ? t.completedByStaffId : null,
          completedByStaffName: value ? t.completedByStaffName : null
        } : t));
      } else {
        setJobTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
      }

      // Save default bookTime if updated and task has a title
      if (field === 'bookTime') {
        const task = jobTasks.find(t => t.id === taskId);
        if (task?.title) {
          const docId = encodeURIComponent(task.title);
          setDoc(doc(db, `businesses/${tenantId}/task_defaults`, docId), {
            title: task.title,
            bookTime: value,
            updatedAt: serverTimestamp()
          }, { merge: true }).catch(err => console.error("Error saving task default time:", err));
          
          setTaskDefaults(prev => ({ ...prev, [task.title]: value }));
        }
      }
    } else {
      try {
        const updateObj: any = {
          [field]: value,
          updatedAt: serverTimestamp()
        };

        if (field === 'canComplete' && value === false) {
          updateObj.completedAt = null;
          updateObj.completedBy = null;
          updateObj.completedByStaffId = null;
          updateObj.completedByStaffName = null;
          updateObj.status = 'pending';
        }

        if (field === 'assignedStaff') {
          updateObj.assignedStaffIds = (value || []).map((s: any) => s.id);
        }

        if (field === 'title') {
          const defaultHours = taskDefaults[value];
          const isDiagRepair = value.toLowerCase().trim() === 'labor:diagnose/repair';
          const finalHours = typeof defaultHours === 'number' ? defaultHours : (isDiagRepair ? 1 : undefined);
          if (finalHours !== undefined) {
            updateObj.bookTime = finalHours;
            updateObj.payBasis = 'book_time';
          }
        }

        if (field === 'completedAt') {
          updateObj.status = value ? 'QC' : 'pending';
          if (value) {
            updateObj.completedBy = user?.displayName || user?.email;
            updateObj.completedByStaffId = user?.uid;
            updateObj.completedByStaffName = user?.displayName || user?.email || 'Staff';
          } else {
            updateObj.completedBy = null;
            updateObj.completedByStaffId = null;
            updateObj.completedByStaffName = null;
          }
        }

        if (field === 'status') {
          const task = jobTasks.find(t => t.id === taskId);
          if (value === 'QC') {
            if (!task?.completedAt) {
              updateObj.completedAt = new Date().toISOString();
            }
            updateObj.completedBy = user?.displayName || user?.email;
            updateObj.completedByStaffId = user?.uid;
            updateObj.completedByStaffName = user?.displayName || user?.email || 'Staff';
          } else if (value === 'QC Complete') {
            updateObj.qcCompletedAt = new Date().toISOString();
            updateObj.qcCompletedBy = user?.displayName || user?.email;
            if (!task?.completedByStaffId) {
              updateObj.completedByStaffId = user?.uid;
              updateObj.completedByStaffName = user?.displayName || user?.email || 'Staff';
            }
          } else if (value === 'pending') {
            updateObj.completedAt = null;
            updateObj.completedBy = null;
            updateObj.completedByStaffId = null;
            updateObj.completedByStaffName = null;
          }
        }

        await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), updateObj);

        // Automatically assign task to QC staff if status is QC
        if (updateObj.status === 'QC') {
          await assignQCStaffToTask(tenantId, jobId, taskId);
        }
        
        const task = jobTasks.find(t => t.id === taskId);
        
        // Activity Logging
        if (field === 'title' && task?.title !== value) {
          logActivity('task_updated', `Task title changed to: ${value || 'Unnamed Task'}`);
        } else if (field === 'assignedStaff') {
          const staffNames = (value || []).map((s: any) => s.name || s.displayName || s.email).join(', ');
          logActivity('task_assigned', `Updated staff assignment on task "${task?.title || 'Unnamed Task'}" to: ${staffNames || 'None'}`);
        } else if (field === 'bookTime' && task?.bookTime !== value) {
          logActivity('task_updated', `Updated book time on task "${task?.title || 'Unnamed Task'}" to ${value}h`);
          
          // Save default bookTime if updated and task has a title
          if (task?.title) {
            const docId = encodeURIComponent(task.title);
            setDoc(doc(db, `businesses/${tenantId}/task_defaults`, docId), {
              title: task.title,
              bookTime: value,
              updatedAt: serverTimestamp()
            }, { merge: true }).catch(err => console.error("Error saving task default time:", err));
            
            setTaskDefaults(prev => ({ ...prev, [task.title]: value }));
          }
        } else if (field === 'departmentId' && task?.departmentId !== value) {
          const dept = departments.find(d => d.id === value);
          logActivity('task_updated', `Assigned task "${task?.title || 'Unnamed Task'}" to department: ${dept?.name || 'None'}`);
        }
        
      } catch (err) {
        console.error(err);
        toast.error('Failed to update task');
      }
    }
  };

  const handleRenameTaskGroup = async (oldGroupName: string, newGroupName: string) => {
    if (!newGroupName || !newGroupName.trim() || oldGroupName === newGroupName) return;
    const trimmedNewName = newGroupName.trim();
    
    if (isNew) {
      setJobTasks(prev => prev.map(t => t.taskGroup === oldGroupName ? { ...t, taskGroup: trimmedNewName } : t));
      setCustomGroups(prev => {
        const next = prev.map(g => g === oldGroupName ? trimmedNewName : g);
        return Array.from(new Set(next));
      });
    } else {
      try {
        const tasksToUpdate = jobTasks.filter(t => t.taskGroup === oldGroupName);
        if (tasksToUpdate.length > 0) {
          const batch = writeBatch(db);
          tasksToUpdate.forEach(t => {
            const docRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, t.id);
            batch.update(docRef, {
              taskGroup: trimmedNewName,
              updatedAt: serverTimestamp()
            });
          });
          await batch.commit();
        }
        setCustomGroups(prev => {
          const next = prev.map(g => g === oldGroupName ? trimmedNewName : g);
          return Array.from(new Set(next));
        });
        toast.success(`Successfully renamed task group to "${trimmedNewName}"`);
      } catch (err) {
        console.error('Failed to rename task group:', err);
        toast.error('Failed to rename task group.');
      }
    }
  };

  const handleDeleteTaskGroup = async (groupName: string) => {
    if (isGeneralTask(groupName)) return;

    // Check if the group contains any tasks
    const hasTasks = jobTasks.some(t => t.taskGroup === groupName);
    if (hasTasks) {
      toast.error('Cannot delete a task group that has tasks. Please delete or move all tasks in this group first.');
      return;
    }

    if (!confirm(`Are you sure you want to delete the empty task group "${groupName}"?`)) return;

    setCustomGroups(prev => prev.filter(g => g !== groupName));
    toast.success(`Removed task group "${groupName}"`);
  };




  if (!formData || formData.currentZoneId === undefined) return (
    <div className="flex items-center justify-center p-12">
      <Sparkles className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );

  return (
    <div className="max-w-[98%] mx-auto space-y-8 pb-24 px-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Edit Job</h1>
            <p className="text-sm text-zinc-500">Update administrative details for this work order</p>
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center justify-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 active:scale-95 w-full md:w-auto"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Job Details'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column - Core Meta & Customer */}
        <div className="lg:col-span-8 space-y-10 lg:order-1">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                <Briefcase className="w-5 h-5 text-indigo-500" />
              </div>
              <label className="block text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">Basic Information</label>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Job #</label>
                <input 
                  type="text" 
                  value={formData.jobNumber} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, jobNumber: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-mono text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Job Title</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Status</label>
                <SearchableSelect
                  options={['Open', 'Active', 'Almost Ready', 'Blocked', 'On Hold', 'Ready for QC', 'Ready for Customer', 'Completed', 'Closed']}
                  value={formData.status}
                  onChange={val => setFormData((prev: any) => ({ ...prev, status: val || 'Open' }))}
                  getLabel={s => s}
                  getValue={s => s}
                  theme="indigo"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Priority</label>
                <SearchableSelect
                  options={['0 - Not Ready', '1 - Low', '2 - Medium-Low', '3 - Medium', '4 - High', '5 - Urgent']}
                  value={formData.priority || '3 - Medium'}
                  onChange={val => setFormData((prev: any) => ({ ...prev, priority: val || '3 - Medium' }))}
                  getLabel={s => s}
                  getValue={s => s}
                  theme="rose"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Arrival Time</label>
                <input 
                  type="datetime-local" 
                  value={formData.scheduledArrivalTime} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, scheduledArrivalTime: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Finish ETA (Calculated)</label>
                <input 
                  type="datetime-local" 
                  value={formData.expectedFinishTime} 
                  disabled
                  readOnly
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none font-medium text-sm text-zinc-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Scheduled Start</label>
                <input 
                  type="datetime-local" 
                  value={formData.scheduledStartDate || ''}
                  onChange={e => {
                    const newStart = e.target.value;
                    setFormData((prev: any) => {
                      if (!newStart) return { ...prev, scheduledStartDate: '' };
                      
                      const remainingHours = jobTasks.filter(t => !isGeneralTask(t)).reduce((acc, t) => {
                        const book = t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0);
                        const actual = parseFloat(t.actualTime) || 0;
                        return acc + Math.max(0, book - actual);
                      }, 0);
                      
                      const realTimeHours = remainingHours / 0.8; // 80% efficiency
                      const startD = new Date(newStart);
                      
                      const endD = projectWorkingHours(startD, realTimeHours);
                      const localEnd = new Date(endD.getTime() - (endD.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                      
                      return { 
                        ...prev, 
                        scheduledStartDate: newStart,
                        scheduledEndDate: localEnd
                      };
                    });
                  }}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Scheduled End</label>
                <input 
                  type="datetime-local" 
                  value={formData.scheduledEndDate} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, scheduledEndDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Scheduled Bay</label>
                <SearchableSelect
                  options={[...zones.filter(z => z.type === 'bay').sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(z => z.name || z.id), 'Mobile']}
                  value={formData.bayId || ''}
                  onChange={val => setFormData((prev: any) => ({ ...prev, bayId: val || '' }))}
                  getLabel={s => s}
                  getValue={s => s}
                  theme="indigo"
                />
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-amber-500/10 rounded-xl">
                <User className="w-5 h-5 text-amber-500" />
              </div>
              <label className="block text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">Customer</label>
            </div>
            <CustomerSelector 
              tenantId={tenantId}
              customerId={formData.customerId}
              placeholder={formData.customerName || "Assign a Customer..."}
              onAssign={(id, name) => setFormData((prev: any) => ({ ...prev, customerId: id, customerName: name }))}
              onClear={() => setFormData((prev: any) => ({ ...prev, customerId: null, customerName: '' }))}
              onCreateNewRequest={(name) => setQuickAddCustomer(name || '')}
            />
          </section>
        </div>

        {/* Bottom Row - Tasks */}
        <div className="lg:col-span-12 min-w-0 space-y-10 lg:order-3 mt-4">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                  <CheckSquare className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Job Tasks</h3>
              </div>
              <div className="flex items-center gap-3">
                {jobTasks.filter(t => !isGeneralTask(t)).length === 0 && (
                  <button 
                    type="button"
                    onClick={() => setIsCopyTasksOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-[1.02] transition-all active:scale-95 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" /> Copy Tasks From Job
                  </button>
                )}
                {jobTasks.filter(t => !isGeneralTask(t)).length > 0 && (
                  <div className="w-52 print-hidden">
                    <InlineSearchableSelect
                      value=""
                      options={staffList.map(s => ({ value: s.id, label: `${s.firstName} ${s.lastName}`.trim() }))}
                      onChange={async (val) => {
                        if (!val) return;
                        const member = staffList.find(s => s.id === val);
                        if (member) {
                          const fullName = `${member.firstName} ${member.lastName}`.trim();
                          await handleBulkAssignUnworked(val, fullName);
                        }
                      }}
                      placeholder="Bulk Assign Unworked..."
                    />
                  </div>
                )}
                <button 
                  type="button"
                  onClick={() => {
                    const groupName = window.prompt('Enter new Task Group name:');
                    if (groupName && groupName.trim()) {
                      setCustomGroups(prev => [...prev, groupName.trim()]);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-[1.02] transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Task Group
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {(() => {
                const sortedJobTasks = [...jobTasks].sort((a, b) => {
                   const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
                   const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
                   if (aOrder !== bOrder) return aOrder - bOrder;

                   const aTime = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0);
                   const bTime = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0);
                   return aTime - bTime;
                });
                const groupedTasks = sortedJobTasks.reduce((acc, task) => {
                  const group = task.taskGroup || 'Uncategorized';
                  if (!acc[group]) acc[group] = [];
                  acc[group].push(task);
                  return acc;
                }, {} as Record<string, any[]>);
                
                customGroups.forEach(cg => {
                  if (!groupedTasks[cg]) groupedTasks[cg] = [];
                });
                
                return Object.entries(groupedTasks).sort(([a], [b]) => isGeneralTask(a) ? -1 : isGeneralTask(b) ? 1 : a.localeCompare(b)).map(([group, tasksData]) => {
                  const tasks = tasksData as any[];
                  return (
                  <div key={group} className="w-full min-w-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
                    {/* Header Row */}
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-955 border-b border-zinc-200 dark:border-zinc-800 rounded-t-3xl">
                      <div className="flex items-center gap-3">
                        {!isGeneralTask(group) ? (
                          <div className="flex items-center gap-2 group/header">
                            <h4 className="text-sm font-black uppercase tracking-widest text-indigo-500">{group}</h4>
                            <button
                              type="button"
                              onClick={() => {
                                const newName = window.prompt(`Rename task group "${group}" to:`, group);
                                if (newName && newName.trim() && newName.trim() !== group) {
                                  handleRenameTaskGroup(group, newName.trim());
                                }
                              }}
                              className="opacity-0 group-hover/header:opacity-100 p-1 text-zinc-400 hover:text-indigo-500 hover:bg-zinc-150 dark:hover:bg-zinc-800 rounded transition-all cursor-pointer flex items-center justify-center"
                              title="Rename Category"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTaskGroup(group)}
                              className="opacity-0 group-hover/header:opacity-100 p-1 text-zinc-400 hover:text-rose-500 hover:bg-zinc-150 dark:hover:bg-zinc-800 rounded transition-all cursor-pointer flex items-center justify-center"
                              title="Delete Category"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <h4 className="text-sm font-black uppercase tracking-widest text-indigo-500">{group}</h4>
                        )}
                        <span className="text-[10px] font-bold text-zinc-500 bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded-lg shrink-0">
                          {tasks.reduce((acc, t) => acc + (t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0)), 0).toFixed(1)}h Total
                        </span>
                      </div>
                    </div>
                    
                    {/* Excel-like Table View */}
                    <div className="overflow-x-auto w-full">
                      <table 
                        onKeyDown={(e) => handleTableKeyDown(e, group, tasks)}
                        className="w-full border-collapse text-left text-xs table-fixed"
                      >
                        <thead>
                          <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-850 text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-550 tracking-wider">
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 text-center w-[90px]"># / Actions</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[200px]">Task Title</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[110px]">Department</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[160px]">Techs / Staff</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[100px]">Pay Basis</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[55px] text-center">Book</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[100px] text-center">Actual</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[220px]">Notes</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[95px] text-center">Can Complete</th>
                            <th className="p-2 border-r border-zinc-200 dark:border-zinc-800 w-[140px]">Completed Date</th>
                            <th className="p-2 text-center w-[105px]">QA Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-850">
                          {tasks.map((task, idx) => {
                            const isGen = isGeneralTask(task);
                            return (
                              <tr 
                                key={task.id} 
                                onDragOver={e => {
                                  if (!isGen) {
                                    e.preventDefault();
                                    if (dragOverTaskId !== task.id) {
                                      setDragOverTaskId(task.id);
                                    }
                                  }
                                }}
                                onDragLeave={() => {
                                  if (!isGen) {
                                    setDragOverTaskId(prev => prev === task.id ? null : prev);
                                  }
                                }}
                                onDrop={async (e) => {
                                  if (!isGen) {
                                    e.preventDefault();
                                    setDragOverTaskId(null);
                                    const draggedId = e.dataTransfer.getData('text/plain');
                                    if (draggedId && draggedId !== task.id) {
                                      await handleReorderTasks(draggedId, task.id, group);
                                    }
                                  }
                                }}
                                className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors ${
                                  task.isAccidental ? 'bg-rose-500/[0.02] dark:bg-rose-500/[0.01] opacity-75' : ''
                                } ${
                                  dragOverTaskId === task.id ? 'border-t-2 border-t-indigo-500 bg-indigo-50/10 dark:bg-indigo-900/10' : ''
                                }`}
                              >
                                {/* 1. Actions */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1">
                                    {!isGen && (
                                      <div
                                        draggable
                                        onDragStart={e => {
                                          e.dataTransfer.setData('text/plain', task.id);
                                          e.dataTransfer.effectAllowed = 'move';
                                        }}
                                        className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-650 p-0.5"
                                        title="Drag to reorder"
                                      >
                                        <GripVertical className="w-3.5 h-3.5" />
                                      </div>
                                    )}
                                    <span className="text-[10px] font-bold text-zinc-300 dark:text-zinc-650 w-4 text-right mr-1">{idx + 1}</span>
                                    {!isGen ? (
                                      <>
                                        <button 
                                          type="button"
                                          onClick={() => { setCopiedTaskClipboard(task); toast.success('Row copied'); }}
                                          className="text-zinc-400 hover:text-indigo-500 transition-colors p-0.5 cursor-pointer"
                                          title="Copy Row"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                          type="button"
                                          disabled={!copiedTaskClipboard}
                                          onClick={() => updateMultipleTaskFields(task.id, copiedTaskClipboard)}
                                          className={`transition-colors p-0.5 ${copiedTaskClipboard ? 'text-zinc-400 hover:text-emerald-500 cursor-pointer' : 'text-zinc-200 dark:text-zinc-800 cursor-not-allowed'}`}
                                          title="Paste Row"
                                        >
                                          <Clipboard className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                          type="button"
                                          onClick={() => handleDuplicateTask(task)}
                                          className="text-zinc-400 hover:text-indigo-500 transition-colors p-0.5 cursor-pointer"
                                          title="Duplicate Row"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                          type="button"
                                          onClick={() => handleDeleteTask(task.id)}
                                          className="text-zinc-400 hover:text-rose-500 transition-colors p-0.5 cursor-pointer"
                                          title="Delete Row"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    ) : (
                                      <button 
                                        type="button"
                                        onClick={() => handleDeleteTask(task.id)}
                                        className="text-zinc-400 hover:text-rose-500 transition-colors p-0.5 cursor-pointer"
                                        title="Delete Row"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* 2. Task Title */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800">
                                  {isGen ? (
                                    <span className="px-2 py-1 font-bold text-zinc-550 dark:text-zinc-400">{task.title}</span>
                                  ) : (
                                    <TaskTitleAutocomplete
                                      value={task.title}
                                      onChange={val => updateTaskField(task.id, 'title', val)}
                                      qbItems={qbItems}
                                      id={`task-title-${task.id}`}
                                    />
                                  )}
                                </td>

                                {/* 3. Department */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800">
                                  {isGen ? (
                                    <span className="px-2 py-1 text-zinc-450 dark:text-zinc-600 font-medium">N/A</span>
                                  ) : (
                                    <InlineSearchableSelect
                                      value={task.departmentId || ''}
                                      options={departments.map(d => ({ value: d.id, label: d.name }))}
                                      onChange={val => updateTaskField(task.id, 'departmentId', val)}
                                      placeholder="Select Dept..."
                                    />
                                  )}
                                </td>

                                {/* 4. Techs */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800">
                                  <div className="flex flex-wrap items-center gap-1.5 px-2 py-1">
                                    {(task.assignedStaff || []).map((s: any) => (
                                      <span key={s.id} className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                        {s.name.split(' ')[0]}
                                        <button 
                                          type="button" 
                                          onClick={() => {
                                            const newStaff = (task.assignedStaff || []).filter((x: any) => x.id !== s.id);
                                            updateTaskField(task.id, 'assignedStaff', newStaff);
                                          }}
                                          className="text-amber-500 hover:text-amber-700 font-black text-xs cursor-pointer"
                                        >
                                          &times;
                                        </button>
                                      </span>
                                    ))}
                                    <InlineSearchableSelect
                                      value=""
                                      options={staffList
                                        .filter(s => !(task.assignedStaff || []).some((x: any) => x.id === s.id))
                                        .map(s => ({ value: s.id, label: `${s.firstName} ${s.lastName}`.trim() }))}
                                      onChange={val => {
                                        if (!val) return;
                                        const member = staffList.find(s => s.id === val);
                                        if (member) {
                                          const fullName = `${member.firstName} ${member.lastName}`.trim();
                                          const alreadyAssigned = (task.assignedStaff || []).some((s: any) => s.id === val);
                                          if (!alreadyAssigned) {
                                            updateTaskField(task.id, 'assignedStaff', [...(task.assignedStaff || []), { id: val, name: fullName }]);
                                          }
                                        }
                                      }}
                                      placeholder="+ Add..."
                                      className="w-20"
                                    />
                                  </div>
                                </td>

                                {/* 5. Pay Basis */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800">
                                  {isGen ? (
                                    <span className="px-2 py-1 text-zinc-400 dark:text-zinc-650 font-medium">N/A</span>
                                  ) : (
                                    <select
                                      value={task.payBasis || 'book_time'}
                                      onChange={e => updateTaskField(task.id, 'payBasis', e.target.value)}
                                      className="w-full bg-transparent border-none px-1 py-1 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer bg-white dark:bg-zinc-900"
                                    >
                                      <option value="book_time" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Book Time</option>
                                      <option value="hourly" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Hourly Task</option>
                                    </select>
                                  )}
                                </td>

                                {/* 6. Book */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800">
                                  {isGen ? (
                                    <span className="block text-center text-zinc-400 dark:text-zinc-650 font-medium">N/A</span>
                                  ) : task.payBasis !== 'hourly' ? (
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={task.bookTime}
                                      onChange={e => updateTaskField(task.id, 'bookTime', parseFloat(e.target.value) || 0)}
                                      className="w-full bg-transparent border-none px-1 py-1 text-center font-bold text-indigo-600 dark:text-indigo-400 focus:ring-1 focus:ring-indigo-500 outline-none text-xs"
                                      placeholder="0.0"
                                    />
                                  ) : (
                                    <span className="block text-center text-zinc-400 font-semibold">Hourly</span>
                                  )}
                                </td>

                                {/* 7. Actual */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800">
                                  {isGen ? (
                                    <div className="flex flex-col items-center justify-center text-[10px] font-bold">
                                      <span className="text-zinc-500 dark:text-zinc-450">{(getTaskLoggedMs(task.id) / 3600000).toFixed(1)}h</span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-0.5 px-1">
                                      <div className="flex items-center gap-1 justify-center">
                                        <input
                                          type="number"
                                          step="0.1"
                                          value={task.actualTime || ''}
                                          onChange={e => updateTaskField(task.id, 'actualTime', parseFloat(e.target.value) || 0)}
                                          className="w-12 bg-transparent border border-zinc-200 dark:border-zinc-850 rounded px-1 py-0.5 text-center text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none text-zinc-900 dark:text-white"
                                          placeholder="0.0"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => updateTaskField(task.id, 'isAccidental', !task.isAccidental)}
                                          className={`p-0.5 rounded transition-colors ${
                                            task.isAccidental ? 'bg-rose-500/10 text-rose-500' : 'text-zinc-400 hover:text-zinc-605'
                                          }`}
                                          title="Accidental"
                                        >
                                          <AlertCircle className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <div className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 text-center">
                                        Logged: {(getTaskLoggedMs(task.id) / 3600000).toFixed(1)}h
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* 8. Notes */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800">
                                  <input
                                    type="text"
                                    value={task.description || ''}
                                    onChange={e => updateTaskField(task.id, 'description', e.target.value)}
                                    className="w-full bg-transparent border-none px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-medium text-zinc-900 dark:text-white"
                                    placeholder={isGen ? "General shop work and cleanup" : "Add specific notes details..."}
                                  />
                                </td>

                                {/* 8.5. Can Complete */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 text-center">
                                  {isGen ? (
                                    <span className="text-zinc-400 dark:text-zinc-655 font-medium">N/A</span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={task.canComplete !== false}
                                      onChange={e => updateTaskField(task.id, 'canComplete', e.target.checked)}
                                      className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                                    />
                                  )}
                                </td>

                                {/* 9. Completed Date */}
                                <td className="p-1 border-r border-zinc-200 dark:border-zinc-800">
                                  {isGen ? (
                                    <span className="px-2 py-1 text-zinc-450 dark:text-zinc-655 font-medium">N/A</span>
                                  ) : task.canComplete === false ? (
                                    <span className="px-2 py-1 text-zinc-400 dark:text-zinc-600 italic block text-center">Cannot complete</span>
                                  ) : (
                                    <input
                                      type="datetime-local"
                                      value={task.completedAt ? new Date(task.completedAt.seconds ? task.completedAt.seconds * 1000 : task.completedAt).toISOString().slice(0, 16) : ''}
                                      onChange={e => updateTaskField(task.id, 'completedAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
                                      className="w-full bg-transparent border-none px-1 py-0.5 focus:ring-1 focus:ring-indigo-500 outline-none text-[10px] text-zinc-700 dark:text-zinc-300"
                                    />
                                  )}
                                </td>

                                {/* 10. QA Status */}
                                <td className="p-1 text-center">
                                  {isGen ? (
                                    <span className="text-zinc-400 dark:text-zinc-655 font-medium">N/A</span>
                                  ) : task.canComplete === false ? (
                                    <span className="text-zinc-450 dark:text-zinc-600 italic">Disabled</span>
                                  ) : (
                                    <select
                                      value={task.status || 'pending'}
                                      onChange={e => updateTaskField(task.id, 'status', e.target.value)}
                                      className={`bg-transparent border-none px-1 py-0.5 focus:ring-1 focus:ring-indigo-500 outline-none text-[10px] font-black uppercase tracking-wider cursor-pointer bg-white dark:bg-zinc-900 ${
                                        task.status === 'QC Complete' ? 'text-emerald-500' : task.status === 'QC' ? 'text-amber-500' : 'text-zinc-500'
                                      }`}
                                    >
                                      <option value="pending" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Pending</option>
                                      <option value="QC" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Needs QA</option>
                                      <option value="QC Complete" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">Approved</option>
                                    </select>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Add Row Button */}
                    {!isGeneralTask(group) && (
                      <div 
                        onDragOver={e => {
                          e.preventDefault();
                        }}
                        onDrop={async (e) => {
                          e.preventDefault();
                          const draggedId = e.dataTransfer.getData('text/plain');
                          if (draggedId) {
                            await handleReorderTasks(draggedId, null, group);
                          }
                        }}
                        className="p-2 border-t border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-955/50 rounded-b-3xl flex items-center gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const staff = tasks.length > 0 && tasks[0].assignedStaff ? tasks[0].assignedStaff : [];
                            const deptId = tasks.length > 0 ? tasks[0].departmentId : undefined;
                            handleInlineAddTask(group, staff, deptId);
                          }}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-zinc-900 text-zinc-550 hover:text-indigo-650 dark:hover:text-indigo-400 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer"
                          title={`Add Task to ${group}`}
                        >
                          <Plus className="w-4 h-4" /> Add Row
                        </button>
                        
                        {copiedTaskClipboard && (
                          <button
                            type="button"
                            onClick={() => handlePasteAsNewTask(group)}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-zinc-900 text-zinc-550 hover:text-emerald-650 dark:hover:text-emerald-400 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer border border-dashed border-zinc-200 dark:border-zinc-800"
                            title={`Paste copied row as a new row in ${group}`}
                          >
                            <Clipboard className="w-4 h-4 text-emerald-500" /> Paste Copied as New Row
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  );
                });
              })()}
              {jobTasks.length === 0 && (
                <div className="p-12 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl">
                  <CheckSquare className="w-8 h-8 text-zinc-200 dark:text-zinc-800 mx-auto mb-3" />
                  <p className="text-sm font-bold text-zinc-400">No tasks added to this job yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column - Vehicle & Notes */}
        <div className="lg:col-span-4 space-y-8 lg:order-2">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <MapPin className="w-4 h-4 text-indigo-500" />
              </div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Current Location (Bay / Parking)</label>
            </div>
            
            <SearchableSelect
              theme="indigo"
              options={zones.sort((a, b) => a.name.localeCompare(b.name))}
              value={formData.currentZoneId}
              onChange={val => setFormData((prev: any) => ({ ...prev, currentZoneId: val || '' }))}
              getLabel={z => z.name}
              getValue={z => z.id}
              placeholder="-- Unassigned --"
              searchPlaceholder="Filter bays & parking..."
              renderOption={(zone) => (
                <div className="flex flex-col">
                  <span className="font-bold text-zinc-900 dark:text-white text-sm">
                    {zone.name}
                  </span>
                  {zone.currentJobId && zone.currentJobId !== jobId && (
                    <span className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-0.5">
                      Occupied
                    </span>
                  )}
                  {(!zone.currentJobId || zone.currentJobId === jobId) && (
                    <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mt-0.5">
                      Available
                    </span>
                  )}
                </div>
              )}
            />
            <p className="text-[10px] text-zinc-400 mt-2 italic px-1">Assigning a job to a bay will show it on Mission Control boards.</p>
          </section>

          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <Car className="w-4 h-4 text-emerald-500" />
              </div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Vehicle Linking</label>
            </div>
            <VinSelector
              vin={formData.vehicleId}
              vehicles={vehicles}
              onAssign={(vin) => setFormData((prev: any) => ({ ...prev, vehicleId: vin }))}
              onClear={() => setFormData((prev: any) => ({ ...prev, vehicleId: '' }))}
              onQuickAddRequest={(vin) => setQuickAddVehicle(vin)}
            />
          </section>

          {!isNew && (
            <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-xl">
                    <Package className="w-4 h-4 text-amber-500" />
                  </div>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">Parts Management</label>
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-lg shrink-0">
                  {parts.length} Total
                </span>
              </div>
              <div className="space-y-3">
                {parts.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic text-center py-4">No parts requested for this job.</p>
                ) : (
                  parts.map(part => {
                    return (
                      <div 
                        key={part.id} 
                        onClick={() => {
                          const canManageParts = isSuperAdmin || permissions['parts.manage'];
                          if (canManageParts) {
                            setSelectedPartForEdit(part);
                          }
                        }}
                        className={`p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group transition-all ${
                          (isSuperAdmin || permissions['parts.manage']) ? "hover:border-amber-500/50 cursor-pointer" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1 mr-4">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">{part.partName}</h4>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shrink-0 ${
                              part.status === 'delivered' || part.status === 'fulfilled' ? "bg-indigo-500/10 text-indigo-600" :
                              part.status === 'inventoried' ? "bg-purple-500/10 text-purple-650" :
                              part.status === 'received' ? "bg-emerald-500/10 text-emerald-600" :
                              part.status === 'ordered' ? "bg-blue-500/10 text-blue-600" :
                              "bg-amber-500/10 text-amber-600"
                            }`}>
                              {part.status === 'delivered' || part.status === 'fulfilled' ? "with vehicle" : 
                               part.status === 'inventoried' ? "inventoried" : part.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-500 truncate">
                            {part.taskTitle ? `Task: ${part.taskTitle}` : 'General Part'}
                            {part.quantity > 1 && ` • Qty: ${part.quantity}`}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                
                <button 
                  onClick={() => setIsPartRequestOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-amber-500 text-amber-600 dark:text-amber-500 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-amber-500/5 transition-all mt-2"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Request Parts
                </button>
              </div>
            </section>
          )}

          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">CompanyCam Project ID</label>
            <input 
              type="text"
              value={formData.companyCamId || ''}
              onChange={e => {
                let val = e.target.value;
                const match = val.match(/projects\/(\d+)/);
                if (match) val = match[1];
                setFormData((prev: any) => ({ ...prev, companyCamId: val }));
              }}
              placeholder="Project ID..."
              className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-bold"
            />
          </section>

          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Internal Staff Notes</label>
            <textarea 
              value={formData.notes}
              onChange={e => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
              placeholder="Private internal notes..."
              className="w-full px-4 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none h-64"
            />
          </section>

          <div className="p-6 bg-rose-500/5 border border-rose-500/20 rounded-3xl">
             <h4 className="text-rose-600 dark:text-rose-400 font-bold mb-2 flex items-center gap-2 text-sm">
               <Trash2 className="w-4 h-4" />
               Critical Actions
             </h4>
             <p className="text-xs text-rose-500 mb-4 opacity-80 leading-relaxed">Deleting a job is permanent. This will wipe all tasks and historical data associated with this job.</p>
             <button className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-rose-500/20">
               Delete Permanentely
             </button>
          </div>
        </div>
      </div>

      {quickAddCustomer && (
        <QuickAddCustomerModal
          tenantId={tenantId}
          initialName={quickAddCustomer}
          onClose={() => setQuickAddCustomer(null)}
          onSuccess={(id: string, name: string) => {
            setFormData((prev: any) => ({ ...prev, customerId: id, customerName: name }));
            setQuickAddCustomer(null);
          }}
        />
      )}

      {quickAddVehicle && (
        <QuickAddVehicleModal
          tenantId={tenantId}
          initialVin={quickAddVehicle}
          onClose={() => setQuickAddVehicle(null)}
          onAssign={(vin) => {
            setFormData((prev: any) => ({ ...prev, vehicleId: vin }));
            setQuickAddVehicle(null);
          }}
        />
      )}

      {(isPartRequestOpen || selectedPartForEdit) && (
        <PartsRequestModal 
          tenantId={tenantId}
          user={user}
          jobId={jobId!}
          jobTitle={formData?.title || job?.title || ''}
          taskId={selectedPartForEdit?.taskId}
          taskTitle={selectedPartForEdit?.taskTitle}
          part={selectedPartForEdit}
          onClose={() => {
            setIsPartRequestOpen(false);
            setSelectedPartForEdit(null);
          }}
          onSuccess={() => {
            setIsPartRequestOpen(false);
            setSelectedPartForEdit(null);
          }}
        />
      )}

      {isCopyTasksOpen && (
        <CopyTasksModal
          isOpen={isCopyTasksOpen}
          onClose={() => setIsCopyTasksOpen(false)}
          tenantId={tenantId}
          onCopy={copyTasksFromJob}
          currentJobId={isNew ? undefined : jobId}
        />
      )}


    </div>
  );
}

interface CopyTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onCopy: (sourceJobId: string) => Promise<void>;
  currentJobId?: string;
}

export function CopyTasksModal({ isOpen, onClose, tenantId, onCopy, currentJobId }: CopyTasksModalProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchJobs = async () => {
      setLoading(true);
      try {
        const cleanSearch = searchTerm.toLowerCase().trim();
        const strippedSearch = cleanSearch.startsWith('#') ? cleanSearch.slice(1).trim() : cleanSearch;
        
        if (!cleanSearch) {
          // Default: Fetch the 100 most recent jobs
          const q = query(
            collection(db, `businesses/${tenantId}/jobs`),
            orderBy('createdAt', 'desc'),
            limit(100)
          );
          const snap = await getDocs(q);
          const loadedJobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setJobs(loadedJobs);
        } else {
          // Search query: Run multiple queries in parallel to find matching jobs
          const queries = [];
          const jobsColl = collection(db, `businesses/${tenantId}/jobs`);
          
          // 1. By Job Number (exact string match)
          queries.push(getDocs(query(jobsColl, where('jobNumber', '==', strippedSearch))));
          
          // 2. By Job Number (exact number match if numeric)
          const numValue = parseInt(strippedSearch, 10);
          if (!isNaN(numValue)) {
            queries.push(getDocs(query(jobsColl, where('jobNumber', '==', numValue))));
          }
          
          // 3. By Title prefix (case-sensitive prefix)
          const titleQueryValue = searchTerm.trim();
          if (titleQueryValue) {
            queries.push(getDocs(query(jobsColl, where('title', '>=', titleQueryValue), where('title', '<=', titleQueryValue + '\uf8ff'), limit(50))));
            const capTitle = titleQueryValue.charAt(0).toUpperCase() + titleQueryValue.slice(1);
            queries.push(getDocs(query(jobsColl, where('title', '>=', capTitle), where('title', '<=', capTitle + '\uf8ff'), limit(50))));
          }
          
          // 4. By Customer Name prefix
          const customerQueryValue = searchTerm.trim();
          if (customerQueryValue) {
            queries.push(getDocs(query(jobsColl, where('customerName', '>=', customerQueryValue), where('customerName', '<=', customerQueryValue + '\uf8ff'), limit(50))));
            const capCustomer = customerQueryValue.charAt(0).toUpperCase() + customerQueryValue.slice(1);
            queries.push(getDocs(query(jobsColl, where('customerName', '>=', capCustomer), where('customerName', '<=', capCustomer + '\uf8ff'), limit(50))));
          }

          const snaps = await Promise.all(queries);
          const jobMap = new Map<string, any>();
          snaps.forEach(snap => {
            snap.docs.forEach(doc => {
              jobMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
          });
          
          setJobs(Array.from(jobMap.values()));
        }
      } catch (err) {
        console.error("Error fetching jobs for copy search:", err);
        toast.error("Failed to load search results");
      } finally {
        setLoading(false);
      }
    };

    // Debounce the search input to avoid hitting Firestore on every keypress
    const timer = setTimeout(() => {
      fetchJobs();
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, tenantId, searchTerm]);

  if (!isOpen) return null;

  const filteredJobs = jobs.filter(j => {
    if (currentJobId && j.id === currentJobId) return false;
    const search = searchTerm.toLowerCase().trim();
    if (!search) return true;
    const cleanSearch = search.startsWith('#') ? search.slice(1).trim() : search;
    return (
      (j.title || '').toLowerCase().includes(search) ||
      String(j.jobNumber || '').toLowerCase().includes(cleanSearch) ||
      (j.customerName || '').toLowerCase().includes(search)
    );
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-white flex items-center gap-2.5">
            <Copy className="w-5 h-5 text-indigo-500" />
            Copy Tasks From Another Job
          </h3>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all cursor-pointer">
            <X className="w-5 h-5"/>
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-550 dark:text-zinc-400 leading-relaxed">
            Select a job to copy its task groups, task names, departments, and book hours. Assigned staff, actual times, and completion statuses will not be copied.
          </p>

          <input
            type="text"
            placeholder="Search by job title, job number, or customer..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-zinc-900 dark:text-white"
          />

          <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/50 pr-1 custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-sm font-bold text-zinc-400 animate-pulse">
                Loading jobs...
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="p-8 text-center text-sm font-medium text-zinc-400 italic">
                No jobs found.
              </div>
            ) : (
              filteredJobs.map(j => (
                <button
                  key={j.id}
                  type="button"
                  onClick={async () => {
                    await onCopy(j.id);
                    onClose();
                  }}
                  className="w-full py-3.5 px-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-2xl transition-all flex items-center justify-between group active:scale-[0.99]"
                >
                  <div className="space-y-1">
                    <span className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {j.title}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-tight font-medium">
                      {j.jobNumber && <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">#{j.jobNumber}</span>}
                      {j.customerName && <span>{j.customerName}</span>}
                    </div>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2.5 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-950 cursor-pointer">
                    Select
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
