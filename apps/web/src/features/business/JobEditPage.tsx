import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, collection, getDocs, addDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Briefcase, Save, ArrowLeft, X, User, Car, MapPin, 
  Sparkles, AlertCircle, Trash2, Plus, CheckSquare, 
  Search, Users, Clock, Timer
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { CustomerSelector, QuickAddCustomerModal } from './CustomerSelectionComponents';
import { VinSelector, QuickAddVehicleModal } from './VehicleSelector';
import { StaffSelector } from './StaffSelectionComponents';
import { SearchableSelect } from './SearchableSelect';

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
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [quickAddCustomer, setQuickAddCustomer] = useState<string | null>(null);
  const [quickAddVehicle, setQuickAddVehicle] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>(null);
  const [jobTasks, setJobTasks] = useState<any[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<any[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    bookTime: '0.5',
    assignedStaff: [] as any[]
  });
  const [tasksLoaded, setTasksLoaded] = useState(false);

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
        setFormData({
          title: data.title || '',
          jobNumber: data.jobNumber || '',
          status: data.status || 'Open',
          priority: data.priority || 'Medium',
          vehicleId: data.vehicleId || '',
          customerId: data.customerId || null,
          customerName: data.customerName || '',
          notes: data.notes || '',
          scheduledArrivalTime: formatDatetimeLocal(data.scheduledArrivalTime),
          expectedFinishTime: formatDatetimeLocal(data.expectedFinishTime),
          estimatedHours: data.estimatedHours || '',
          assignedStaff: data.assignedStaff || [],
          currentZoneId: zones.find(z => z.currentJobId === jobId)?.id || ''
        });
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
      priority: 'Medium',
      vehicleId: '',
      customerId: null,
      customerName: '',
      notes: '',
      scheduledArrivalTime: formatDatetimeLocal(new Date()),
      expectedFinishTime: '',
      estimatedHours: '',
      assignedStaff: [],
      currentZoneId: '',
      companyCamId: ''
    });
    setJobTasks([{
      id: 'general-init',
      title: 'General',
      description: 'General shop work and cleanup',
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

  // Auto-add "General" task if missing
  useEffect(() => {
    if (!jobId || !tenantId || !job || !tasksLoaded) return;
    const hasGeneral = jobTasks.some(t => t.title === 'General');
    if (!hasGeneral) {
      const addGeneralTask = async () => {
        try {
          await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), {
            title: 'General',
            description: 'General shop work and cleanup',
            bookTime: 0,
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Error adding general task:", e);
        }
      };
      addGeneralTask();
    }
  }, [jobTasks, tasksLoaded, jobId, tenantId, !!job]);

  // Progression Logic Hook
  useEffect(() => {
    if (!jobTasks.length || !job || !tenantId || !jobId) return;
    
    // Only auto-progress if status is Active, Open, Ready for QA
    const autoProgressable = ['Active', 'Open', 'Ready for QA'].includes(job.status);
    if (!autoProgressable) return;

    const allQCReady = jobTasks.every(t => t.status === 'QC' || t.status === 'QC Complete');
    const allQCComplete = jobTasks.every(t => t.status === 'QC Complete');

    const updateJobStatus = async (newStatus: string, msg: string) => {
      if (job.status === newStatus) return;
      try {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
          status: newStatus,
          updatedAt: new Date()
        });
        toast.success(msg);
      } catch (e) {
        console.error("Auto-progression error:", e);
      }
    };

    if (allQCComplete) {
      updateJobStatus('Ready for Customer', 'Job ready for customer!');
    } else if (allQCReady) {
      updateJobStatus('Ready for QA', 'Job ready for QA inspection');
    }
  }, [jobTasks, job?.status, tenantId, jobId]);

  useEffect(() => {
    if (!tenantId) return;
    getDocs(collection(db, `businesses/${tenantId}/tasks`)).then(snap => {
      setTaskTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [tenantId]);

  useEffect(() => {
    getDocs(collection(db, `businesses/${tenantId}/vehicles`)).then(snap => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    getDocs(collection(db, `businesses/${tenantId}/zones`)).then(snap => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [tenantId]);

  const handleSave = async () => {
    if (!formData || isSaving) return;
    setIsSaving(true);
    try {
      const { expectedFinishTime, scheduledArrivalTime, currentZoneId, ...rest } = formData;
      const payload = {
        ...rest,
        expectedFinishTime: expectedFinishTime ? new Date(expectedFinishTime).toISOString() : null,
        scheduledArrivalTime: scheduledArrivalTime ? new Date(scheduledArrivalTime).toISOString() : null,
        estimatedHours: jobTasks.filter(t => t.title !== 'General').reduce((acc, t) => acc + (parseFloat(t.bookTime) || 0), 0),
        updatedAt: new Date()
      };

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

      toast.success(isNew ? 'Job created successfully' : 'Job updated successfully');
      navigate(`/business/${tenantId}/job/${finalJobId}`);
    } catch (err) {
      console.error(err);
      toast.error(isNew ? 'Failed to create job' : 'Failed to update job');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskData.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    if (isNew) {
      setJobTasks(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        ...newTaskData,
        bookTime: parseFloat(newTaskData.bookTime) || 0,
        status: 'pending'
      }]);
    } else {
      try {
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), {
          ...newTaskData,
          bookTime: parseFloat(newTaskData.bookTime) || 0,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error(err);
        toast.error('Failed to add task');
        return;
      }
    }
      
      setNewTaskData({
        title: '',
        description: '',
        bookTime: '0.5',
        assignedStaff: []
      });
      setIsAddingTask(false);
      toast.success('Task added');
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to remove this task?')) return;
    if (isNew) {
      setJobTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Task removed');
    } else {
      try {
        await deleteDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId));
        toast.success('Task removed');
      } catch (err) {
        console.error(err);
        toast.error('Failed to remove task');
      }
    }
  };

  const updateTaskField = async (taskId: string, field: string, value: any) => {
    if (isNew) {
      setJobTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    } else {
      try {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
          [field]: value,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error(err);
        toast.error('Failed to update task');
      }
    }
  };

  const applyTemplate = (template: any) => {
    setNewTaskData(prev => ({
      ...prev,
      title: template.name,
      description: template.description || '',
      bookTime: template.defaultBookTime?.toString() || '0.5'
    }));
    setShowTemplates(false);
  };

  if (!formData) return (
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
        {/* Left Column - Core Meta & Customer (4/12) */}
        <div className="lg:col-span-4 space-y-10">
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
                  onChange={e => setFormData(prev => ({ ...prev, jobNumber: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-mono text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Job Title</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Status</label>
                <SearchableSelect
                  options={['Open', 'Active', 'Almost Ready', 'Blocked', 'On Hold', 'Ready for QA', 'Ready for Customer', 'Completed', 'Closed']}
                  value={formData.status}
                  onChange={val => setFormData(prev => ({ ...prev, status: val || 'Open' }))}
                  getLabel={s => s}
                  getValue={s => s}
                  theme="indigo"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Priority</label>
                <SearchableSelect
                  options={['Low', 'Medium', 'High', 'Urgent']}
                  value={formData.priority}
                  onChange={val => setFormData(prev => ({ ...prev, priority: val || 'Medium' }))}
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
                  onChange={e => setFormData(prev => ({ ...prev, scheduledArrivalTime: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5">Finish ETA</label>
                <input 
                  type="datetime-local" 
                  value={formData.expectedFinishTime} 
                  onChange={e => setFormData(prev => ({ ...prev, expectedFinishTime: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium text-sm"
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
              onAssign={(id, name) => setFormData(prev => ({ ...prev, customerId: id, customerName: name }))}
              onClear={() => setFormData(prev => ({ ...prev, customerId: null, customerName: '' }))}
              onCreateNewRequest={(name) => setQuickAddCustomer(name || '')}
            />
          </section>
        </div>

        {/* Middle Column - Tasks (5/12) */}
        <div className="lg:col-span-5 space-y-10">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                  <CheckSquare className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Job Tasks</h3>
              </div>
              <button 
                onClick={() => setIsAddingTask(!isAddingTask)}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all active:scale-95"
              >
                {isAddingTask ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {isAddingTask ? 'Cancel' : 'Add New Task'}
              </button>
            </div>

            {isAddingTask && (
              <div className="p-5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="relative">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Template (Optional)</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input 
                        type="text" 
                        placeholder="Search templates..."
                        value={templateSearch}
                        onChange={(e) => { setTemplateSearch(e.target.value); setShowTemplates(true); }}
                        onFocus={() => setShowTemplates(true)}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                    {showTemplates && (
                      <button onClick={() => setShowTemplates(false)} className="p-2 text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                  
                  {showTemplates && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                      {taskTemplates.filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase())).map(t => (
                        <button 
                          key={t.id}
                          onClick={() => applyTemplate(t)}
                          className="w-full px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                        >
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white">{t.name}</p>
                            <p className="text-[10px] text-zinc-500 truncate">{t.description}</p>
                          </div>
                          <span className="text-[10px] font-black text-indigo-500">{t.defaultBookTime}h</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Task Title</label>
                    <input 
                      type="text" 
                      placeholder="Enter task name..."
                      value={newTaskData.title}
                      onChange={e => setNewTaskData(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Allotted Time (Hrs)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={newTaskData.bookTime}
                      onChange={e => setNewTaskData(prev => ({ ...prev, bookTime: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono font-bold text-indigo-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Assign Technicians</label>
                  <StaffSelector 
                    tenantId={tenantId}
                    selectedStaff={newTaskData.assignedStaff}
                    onAssign={staff => setNewTaskData(prev => ({ ...prev, assignedStaff: staff }))}
                  />
                </div>

                <button 
                  onClick={handleAddTask}
                  className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-[1.02] transition-all active:scale-95"
                >
                  Confirm New Task
                </button>
              </div>
            )}

            <div className="space-y-3">
              {jobTasks.map(task => (
                <div key={task.id} className="p-5 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl group hover:border-indigo-500/30 transition-all">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Task Title</label>
                          <input 
                            type="text" 
                            value={task.title}
                            onChange={e => updateTaskField(task.id, 'title', e.target.value)}
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
                          />
                        </div>
                        {task.title !== 'General' && (
                          <div className="w-full md:w-40">
                            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Allotted Time</label>
                            <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2">
                              <Timer className="w-4 h-4 text-indigo-500" />
                              <input 
                                type="number" 
                                step="0.1"
                                value={task.bookTime}
                                onChange={e => updateTaskField(task.id, 'bookTime', parseFloat(e.target.value) || 0)}
                                className="w-full bg-transparent border-none p-0 text-sm font-mono font-bold text-indigo-600 focus:ring-0 text-center"
                              />
                              <span className="text-[10px] font-black text-zinc-400">HRS</span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {task.title !== 'General' && (
                        <div>
                          <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Assigned Technicians</label>
                          <StaffSelector 
                            tenantId={tenantId}
                            selectedStaff={task.assignedStaff || []}
                            onAssign={staff => updateTaskField(task.id, 'assignedStaff', staff)}
                          />
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 text-zinc-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {jobTasks.length === 0 && !isAddingTask && (
                <div className="p-12 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl">
                  <CheckSquare className="w-8 h-8 text-zinc-200 dark:text-zinc-800 mx-auto mb-3" />
                  <p className="text-sm font-bold text-zinc-400">No tasks added to this job yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column - Vehicle & Notes (3/12) */}
        <div className="lg:col-span-3 space-y-8">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <MapPin className="w-4 h-4 text-indigo-500" />
              </div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Bay / Parking Assignment</label>
            </div>
            
            <SearchableSelect
              theme="indigo"
              options={zones.sort((a, b) => a.name.localeCompare(b.name))}
              value={formData.currentZoneId}
              onChange={val => setFormData(prev => ({ ...prev, currentZoneId: val || '' }))}
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
              onAssign={(vin) => setFormData(prev => ({ ...prev, vehicleId: vin }))}
              onClear={() => setFormData(prev => ({ ...prev, vehicleId: '' }))}
              onQuickAddRequest={(vin) => setQuickAddVehicle(vin)}
            />
          </section>

          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">CompanyCam Project ID</label>
            <input 
              type="text"
              value={formData.companyCamId || ''}
              onChange={e => setFormData(prev => ({ ...prev, companyCamId: e.target.value }))}
              placeholder="Project ID..."
              className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-bold"
            />
          </section>

          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Internal Staff Notes</label>
            <textarea 
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
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
            setFormData(prev => ({ ...prev, customerId: id, customerName: name }));
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
            setFormData(prev => ({ ...prev, vehicleId: vin }));
            setQuickAddVehicle(null);
          }}
        />
      )}
    </div>
  );
}
