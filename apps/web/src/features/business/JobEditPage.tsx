import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, collection, getDocs, addDoc, deleteDoc, writeBatch, serverTimestamp, query, where, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Briefcase, Save, ArrowLeft, User, Car, MapPin, 
  Sparkles, AlertCircle, Trash2, Copy, Plus, CheckSquare,
  Wrench, Package, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { assignQCStaffToTask, assignQCStaffToJob } from '../../lib/auth/qcAssignment';
import { CustomerSelector, QuickAddCustomerModal } from './CustomerSelectionComponents';
import { VinSelector, QuickAddVehicleModal } from './VehicleSelector';
import { StaffSelector } from './StaffSelectionComponents';
import { SearchableSelect } from './SearchableSelect';
import { projectWorkingHours } from './ScheduleBoard';
import { PartsRequestModal } from './PartsRequestModal';

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

  useEffect(() => {
    if (isNew) return;
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, [isNew]);

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
    setJobTasks([{
      id: 'general-init',
      title: 'General',
      description: 'General clock in to job when no task clock in here',
      taskGroup: 'General',
      bookTime: 0,
      status: 'pending',
      assignedStaff: []
    }]);
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

  const addingGeneralRef = useRef(false);

  // Auto-add "General" task if missing
  useEffect(() => {
    if (!jobId || !tenantId || !job || !tasksLoaded) return;
    const hasGeneral = jobTasks.some(t => t.title === 'General');
    if (!hasGeneral && !addingGeneralRef.current) {
      addingGeneralRef.current = true;
      const addGeneralTask = async () => {
        try {
          const q = query(
            collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`),
            where('title', '==', 'General')
          );
          const snap = await getDocs(q);
          if (snap.empty) {
            await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), {
              title: 'General',
              description: 'General clock in to job when no task clock in here',
              taskGroup: 'General',
              bookTime: 0,
              status: 'pending',
              tenantId: tenantId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        } catch (e) {
          console.error("Error adding general task:", e);
          addingGeneralRef.current = false;
        }
      };
      addGeneralTask();
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

    const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
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
        estimatedHours: jobTasks.filter(t => t.title !== 'General').reduce((acc, t) => acc + (parseFloat(t.bookTime) || 0), 0),
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
      departmentId: initialDepartmentId || ''
    };

    if (isNew) {
      setJobTasks(prev => [...prev, { id: tempId, ...newTask }]);
      setTimeout(() => document.getElementById(`task-title-${tempId}`)?.click(), 100);
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
        setTimeout(() => document.getElementById(`task-title-${docRef.id}`)?.click(), 500);
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

  const updateTaskField = async (taskId: string, field: string, value: any) => {
    if (isNew) {
      if (field === 'title') {
        const defaultHours = taskDefaults[value];
        if (typeof defaultHours === 'number') {
          setJobTasks(prev => prev.map(t => t.id === taskId ? { ...t, title: value, bookTime: defaultHours } : t));
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

        if (field === 'assignedStaff') {
          updateObj.assignedStaffIds = (value || []).map((s: any) => s.id);
        }

        if (field === 'title') {
          const defaultHours = taskDefaults[value];
          if (typeof defaultHours === 'number') {
            updateObj.bookTime = defaultHours;
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




  if (!formData || formData.currentZoneId === undefined) return (
    <div className="flex items-center justify-center p-12">
      <Sparkles className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-24">
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
                      
                      const remainingHours = jobTasks.filter(t => t.title !== 'General').reduce((acc, t) => {
                        const book = parseFloat(t.bookTime) || 0;
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
        <div className="lg:col-span-12 space-y-10 lg:order-3 mt-4">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                  <CheckSquare className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Job Tasks</h3>
              </div>
              <button 
                onClick={() => {
                  const groupName = window.prompt('Enter new Task Group name:');
                  if (groupName && groupName.trim()) {
                    setCustomGroups(prev => [...prev, groupName.trim()]);
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg hover:scale-[1.02] transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" /> Add Task Group
              </button>
            </div>

            <div className="space-y-6">
              {(() => {
                const sortedJobTasks = [...jobTasks].sort((a, b) => {
                   const aTime = a.createdAt?.seconds || (Date.now() / 1000);
                   const bTime = b.createdAt?.seconds || (Date.now() / 1000);
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
                
                return Object.entries(groupedTasks).sort(([a], [b]) => a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b)).map(([group, tasksData]) => {
                  const tasks = tasksData as any[];
                  return (
                  <div key={group} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm">
                    {/* Header Row */}
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 rounded-t-3xl">
                      <div className="flex items-center gap-3">
                        <h4 className="text-sm font-black uppercase tracking-widest text-indigo-500">{group}</h4>
                        <span className="text-[10px] font-bold text-zinc-500 bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded-lg shrink-0">
                          {tasks.reduce((acc, t) => acc + (parseFloat(t.bookTime) || 0), 0).toFixed(1)}h Total
                        </span>
                      </div>
                    </div>
                    
                    {/* Column Headers (Desktop) */}
                    {tasks.length > 0 && (
                      <div className="hidden lg:grid grid-cols-[70px_1fr_140px_140px_80px_180px_140px_90px] gap-2 px-4 py-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="text-center">#</div>
                        <div>Task Title</div>
                        <div>Department</div>
                        <div>Tech</div>
                        <div className="text-center">Book</div>
                        <div className="text-center">Actual</div>
                        <div>Completed</div>
                        <div className="text-center">QA</div>
                      </div>
                    )}

                    {/* Task Rows */}
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {tasks.map((task, idx) => (
                        <div key={task.id} className={`grid grid-cols-1 lg:grid-cols-[70px_1fr_140px_140px_80px_180px_140px_90px] gap-4 lg:gap-2 items-center p-4 lg:p-2 lg:px-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 transition-colors group relative ${task.isAccidental ? 'bg-rose-500/[0.02] dark:bg-rose-500/[0.01] opacity-75' : ''}`}>
                          
                          {/* 1. Mobile Actions / Index */}
                          <div className="flex items-center justify-between lg:justify-start w-full lg:w-auto gap-2">
                            <span className="text-xs font-bold text-zinc-300 dark:text-zinc-700 w-4 text-right">{idx + 1}</span>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => handleDuplicateTask(task)}
                                className="text-zinc-300 hover:text-indigo-500 transition-colors p-1"
                                title="Duplicate Task"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteTask(task.id)}
                                className="text-zinc-300 hover:text-rose-500 transition-colors p-1"
                                title="Delete Task"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* 2. Title */}
                          <div className="min-w-0 w-full relative">
                            <div className="lg:hidden absolute -top-2 left-2 bg-white dark:bg-zinc-950 px-1 text-[8px] font-bold text-zinc-400 uppercase z-10">Title</div>
                            <SearchableSelect
                              id={`task-title-${task.id}`}
                              options={qbItems}
                              value={task.title}
                              onChange={val => updateTaskField(task.id, 'title', val || '')}
                              getLabel={item => item.FullName || item.Name || 'Unnamed Task'}
                              getValue={item => item.FullName || item.Name || item.id}
                              placeholder="Task Title..."
                              allowCustomValue={true}
                              className="w-full"
                              renderOption={(item) => (
                                <div className="flex items-start justify-between min-w-0 w-full gap-4">
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-zinc-900 dark:text-white text-sm whitespace-normal text-left">
                                      {item.FullName || item.Name || 'Unnamed Task'}
                                    </span>
                                    {(item.Description || item.SalesDesc) && (
                                      <span className="text-[10px] text-zinc-500 line-clamp-2 text-left mt-0.5">
                                        {item.Description || item.SalesDesc}
                                      </span>
                                    )}
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight shrink-0 ${item._source === 'QuickBooks' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'}`}>
                                    {item._source || 'Native'}
                                  </span>
                                </div>
                              )}
                              footerAction={{
                                label: "Save & Use Custom Title",
                                onClick: async (search) => {
                                  if (search.trim()) {
                                    try {
                                      await addDoc(collection(db, `businesses/${tenantId}/native_tasks`), {
                                        Name: search.trim(),
                                        FullName: search.trim(),
                                        createdAt: serverTimestamp()
                                      });
                                      setQbItems(prev => [...prev, { id: Date.now().toString(), Name: search.trim(), FullName: search.trim(), _source: 'Native' }]);
                                      toast.success('Custom task saved for future use');
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }
                                  updateTaskField(task.id, 'title', search);
                                }
                              }}
                            />
                          </div>

                          {/* 3. Department */}
                          <div className="w-full relative">
                            {task.title !== 'General' ? (
                              <>
                                <div className="lg:hidden absolute -top-2 left-2 bg-white dark:bg-zinc-950 px-1 text-[8px] font-bold text-zinc-400 uppercase z-10">Department</div>
                                <SearchableSelect
                                  options={departments}
                                  value={task.departmentId || ''}
                                  onChange={val => updateTaskField(task.id, 'departmentId', val || '')}
                                  getLabel={d => d.name}
                                  getValue={d => d.id}
                                  placeholder="Dept..."
                                  className="w-full"
                                />
                              </>
                            ) : <div/>}
                          </div>

                          {/* 4. Staff */}
                          <div className="w-full relative">
                            {task.title !== 'General' ? (
                              <>
                                <div className="lg:hidden absolute -top-2 left-2 bg-white dark:bg-zinc-950 px-1 text-[8px] font-bold text-zinc-400 uppercase z-10">Tech</div>
                                <StaffSelector 
                                  tenantId={tenantId}
                                  selectedStaff={task.assignedStaff || []}
                                  onAssign={staff => updateTaskField(task.id, 'assignedStaff', staff)}
                                  compact={true}
                                  placeholder="Tech..."
                                />
                              </>
                            ) : <div/>}
                          </div>

                          {/* 5. Book Time */}
                          <div className="w-full relative">
                            {task.title !== 'General' ? (
                              <div className="flex flex-col gap-1 w-full">
                                <div className="lg:hidden absolute -top-2.5 left-2 bg-white dark:bg-zinc-950 px-1 text-[8px] font-bold text-zinc-400 uppercase z-10">Pay Basis</div>
                                <select
                                  value={task.payBasis || 'book_time'}
                                  onChange={e => updateTaskField(task.id, 'payBasis', e.target.value)}
                                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-1.5 text-[10px] font-bold text-zinc-700 dark:text-zinc-300 focus:ring-0 focus:outline-none cursor-pointer"
                                >
                                  <option value="book_time">Book Time</option>
                                  <option value="hourly">Hourly Task</option>
                                </select>
                                {task.payBasis !== 'hourly' && (
                                  <div className={`flex items-center rounded-xl px-2 shadow-sm relative transition-all duration-350 ${
                                    task.bookTime === 0
                                      ? 'bg-rose-500/10 dark:bg-rose-500/20 border-2 border-rose-500 ring-2 ring-rose-500/20 animate-pulse'
                                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800'
                                  }`}>
                                    <input 
                                      type="number" 
                                      step="0.1"
                                      value={task.bookTime}
                                      onChange={e => updateTaskField(task.id, 'bookTime', parseFloat(e.target.value) || 0)}
                                      className={`w-full bg-transparent border-none p-1.5 text-xs font-bold focus:ring-0 text-center transition-colors ${
                                        task.bookTime === 0
                                          ? 'text-rose-500 dark:text-rose-450 font-black'
                                          : 'text-indigo-600 dark:text-indigo-400'
                                      }`}
                                      placeholder="Hrs"
                                    />
                                  </div>
                                )}
                              </div>
                            ) : <div/>}
                          </div>

                          {/* 6. Actual Time */}
                          <div className="w-full relative">
                            {task.title !== 'General' ? (
                              <div className="flex flex-col gap-1 w-full">
                                <div className="flex items-center gap-1.5 w-full">
                                  <div className="flex items-center bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 relative grow">
                                    <div className="lg:hidden absolute -top-2.5 left-2 bg-white dark:bg-zinc-950 px-1 text-[8px] font-bold text-zinc-400 uppercase z-10">Actual Hrs</div>
                                    <input 
                                      type="number" 
                                      step="0.1"
                                      value={task.actualTime || ''}
                                      onChange={e => updateTaskField(task.id, 'actualTime', parseFloat(e.target.value) || 0)}
                                      placeholder="0.0"
                                      className="w-full bg-transparent border-none p-1.5 text-xs font-bold text-zinc-900 dark:text-white focus:ring-0 text-center"
                                    />
                                  </div>
                                  <button
                                    onClick={() => updateTaskField(task.id, 'isAccidental', !task.isAccidental)}
                                    className={`p-1.5 rounded-xl border transition-all flex items-center justify-center shrink-0 ${
                                      task.isAccidental
                                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500/20'
                                        : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                                    }`}
                                    title={task.isAccidental ? "Accidental clock-in. Click to restore clocked hours." : "Flag as accidental clock-in (ignores logged hours)"}
                                  >
                                    <AlertCircle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex items-center justify-between px-1 text-[9px] font-bold">
                                  <span className="text-zinc-400 dark:text-zinc-500">Logged:</span>
                                  {task.isAccidental ? (
                                    <span className="text-rose-500 font-mono flex items-center gap-1">
                                      <span className="line-through opacity-50 font-normal">{(getTaskLoggedMs(task.id) / 3600000).toFixed(1)}h</span>
                                      <span>0.0h</span>
                                    </span>
                                  ) : (() => {
                                    const loggedMs = getTaskLoggedMs(task.id);
                                    const bookHours = parseFloat(task.bookTime) || 0;
                                    const clockedHours = task.actualTime !== undefined && task.actualTime > 0 
                                      ? task.actualTime 
                                      : (loggedMs / 3600000);
                                    const isOver = !task.isAccidental && task.title !== 'General' && bookHours > 0 && clockedHours > bookHours;
                                    const diff = clockedHours - bookHours;
                                    
                                    return (
                                      <span className={`font-mono flex items-center gap-1 shrink-0 ${
                                        isOver ? "text-rose-500 font-bold" : "text-zinc-550 dark:text-zinc-400"
                                      }`}>
                                        {(loggedMs / 3600000).toFixed(1)}h
                                        {isOver && (
                                          <span className="text-[8px] font-black bg-rose-500/10 text-rose-550 border border-rose-500/20 px-1 rounded shrink-0 animate-pulse" title={`Over Budget by ${diff.toFixed(1)}h`}>
                                            +{diff.toFixed(1)}h
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                            ) : <div/>}
                          </div>

                          {/* 7. Completed Date */}
                          <div className="w-full relative">
                            {task.title !== 'General' ? (
                              <>
                                <div className="lg:hidden absolute -top-2 left-2 bg-white dark:bg-zinc-950 px-1 text-[8px] font-bold text-zinc-400 uppercase z-10">Completed</div>
                                <input 
                                  type="datetime-local" 
                                  value={task.completedAt ? new Date(task.completedAt.seconds ? task.completedAt.seconds * 1000 : task.completedAt).toISOString().slice(0, 16) : ''}
                                  onChange={e => updateTaskField(task.id, 'completedAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
                                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 text-[10px] font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                />
                              </>
                            ) : <div/>}
                          </div>

                          {/* 8. QA Button & Mobile Delete */}
                          <div className="w-full flex flex-col gap-2">
                            {task.title !== 'General' ? (
                              task.status === 'QC Complete' ? (
                                <button 
                                  onClick={() => {
                                    if (confirm("Move this task back to pending? This will also clear the completed date.")) {
                                      updateTaskField(task.id, 'status', 'pending');
                                    }
                                  }}
                                  className="w-full text-center px-2 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                      if (idx === tasks.length - 1) {
                                        e.preventDefault();
                                        const staff = tasks.length > 0 && tasks[0].assignedStaff ? tasks[0].assignedStaff : [];
                                        const deptId = tasks.length > 0 ? tasks[0].departmentId : undefined;
                                        handleInlineAddTask(group, staff, deptId);
                                      }
                                    }
                                  }}
                                >
                                  <CheckSquare className="w-3 h-3" /> QA Approved
                                </button>
                              ) : task.status === 'QC' ? (
                                <button 
                                  onClick={() => {
                                    updateTaskField(task.id, 'status', 'QC Complete');
                                  }}
                                  className="w-full text-center px-2 py-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                      if (idx === tasks.length - 1) {
                                        e.preventDefault();
                                        const staff = tasks.length > 0 && tasks[0].assignedStaff ? tasks[0].assignedStaff : [];
                                        const deptId = tasks.length > 0 ? tasks[0].departmentId : undefined;
                                        handleInlineAddTask(group, staff, deptId);
                                      }
                                    }
                                  }}
                                >
                                  <AlertCircle className="w-3 h-3" /> Needs QA
                                </button>
                              ) : (
                                <button
                                  onClick={() => updateTaskField(task.id, 'status', 'QC')}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                      if (idx === tasks.length - 1) {
                                        e.preventDefault();
                                        const staff = tasks.length > 0 && tasks[0].assignedStaff ? tasks[0].assignedStaff : [];
                                        const deptId = tasks.length > 0 ? tasks[0].departmentId : undefined;
                                        handleInlineAddTask(group, staff, deptId);
                                      }
                                    }
                                  }}
                                  className="w-full px-2 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-zinc-500 dark:text-zinc-400 rounded-lg font-black text-[9px] uppercase tracking-widest transition-colors text-center"
                                >
                                  Mark Complete
                                </button>
                              )
                            ) : <div/>}
                            
                            {/* Mobile Delete Button */}
                            <button 
                              onClick={() => handleDeleteTask(task.id)}
                              className="lg:hidden w-full py-2 text-rose-500 border border-rose-200 rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest bg-rose-50 mt-1"
                            >
                              <Trash2 className="w-4 h-4" /> Delete Task
                            </button>
                          </div>

                          {task.title !== 'General' && (
                            <div className="col-span-full lg:col-span-7 lg:col-start-2 mt-1 mb-2 relative">
                              <div className="absolute left-3 top-2.5 text-zinc-400 dark:text-zinc-600">
                                <FileText className="w-3.5 h-3.5" />
                              </div>
                              <input 
                                type="text" 
                                value={task.description || ''}
                                onChange={e => updateTaskField(task.id, 'description', e.target.value)}
                                placeholder="Add specific notes or description for this task (so you don't need separate labor rows)..."
                                className="w-full pl-9 pr-4 py-1.5 bg-zinc-50/50 dark:bg-zinc-950/30 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder-zinc-400 text-zinc-900 dark:text-white"
                              />
                            </div>
                          )}
                          
                        </div>
                      ))}
                    </div>

                    {/* Add Row Button */}
                    {group !== 'General' && (
                      <div className="p-1 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-b-3xl">
                        <button
                          onClick={() => {
                            const staff = tasks.length > 0 && tasks[0].assignedStaff ? tasks[0].assignedStaff : [];
                            const deptId = tasks.length > 0 ? tasks[0].departmentId : undefined;
                            handleInlineAddTask(group, staff, deptId);
                          }}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-white dark:hover:bg-zinc-900 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest w-full"
                          title={`Add Task to ${group}`}
                        >
                          <Plus className="w-4 h-4" /> Add Row
                        </button>
                      </div>
                    )}
                  </div>
                );});
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

      <datalist id="qb-items-list">
        {qbItems.map(item => (
          <option key={item.id} value={item.Name || item.FullName || ''} />
        ))}
      </datalist>
    </div>
  );
}
