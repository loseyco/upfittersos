import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, doc, getDocs, getDoc, setDoc, deleteDoc, serverTimestamp, onSnapshot, collectionGroup, where, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  ClipboardList, Plus, Trash2, Printer, Sparkles, Save, Calendar, RefreshCw,
  Search, CheckCircle2, AlertTriangle, AlertCircle, Info, Square, Package, Sliders,
  CheckSquare, X, ChevronRight, MessageSquare, AlertOctagon, HelpCircle, Layers, Check,
  Clock, Wrench, CalendarDays, ListTodo, User, Building2, Maximize2, Minimize2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';

interface MeetingData {
  id: string;
  meetingDate: string;
  salesPipeline: {
    leads: string[];
    prospecting: string[];
    waitingApproval: string[];
    approved: string[];
  };
  openSalesOrders: {
    days1to30: string[];
    days31to60: string[];
  };
  serviceWork: {
    inProgress: string[];
    needToStart: string[];
    incoming: string[];
    needToSchedule: string[];
  };
  buildSchedule: {
    inShop: string[];
    incomingCompletion: string[];
  };
  orders: {
    neededJobCompletions: string[];
    neededUpcomingJobs: string[];
    restockOrders: string[];
  };
  misc: string[];
  notes: string;
  createdAt?: any;
  updatedAt?: any;
}

const createEmptyMeetingData = (dateStr: string): MeetingData => ({
  id: dateStr,
  meetingDate: dateStr,
  salesPipeline: {
    leads: ['', '', ''],
    prospecting: ['', '', ''],
    waitingApproval: ['', '', '', ''],
    approved: ['', '', '']
  },
  openSalesOrders: {
    days1to30: ['', '', ''],
    days31to60: ['', '', '']
  },
  serviceWork: {
    inProgress: ['', '', ''],
    needToStart: ['', '', ''],
    incoming: ['', '', ''],
    needToSchedule: ['', '', '']
  },
  buildSchedule: {
    inShop: ['', '', '', '', '', '', '', '', '', ''],
    incomingCompletion: ['', '', '', '', '', '', '', '', '', '']
  },
  orders: {
    neededJobCompletions: ['', '', ''],
    neededUpcomingJobs: ['', '', ''],
    restockOrders: ['', '', '']
  },
  misc: ['', '', ''],
  notes: ''
});

export function WeeklyMeetingNotes({ tenantId }: { tenantId: string }) {
  const { permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['office.view'] || permissions['foreman.view'];

  const [meetingsList, setMeetingsList] = useState<{ id: string; meetingDate: string }[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [meetingData, setMeetingData] = useState<MeetingData | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoPopulating, setIsAutoPopulating] = useState(false);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [newMeetingDate, setNewMeetingDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Interactive Meeting Board State
  const [viewMode, setViewMode] = useState<'board' | 'bay_jobs' | 'print'>('bay_jobs');
  const [selectedBoardJobId, setSelectedBoardJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [blockerFilter, setBlockerFilter] = useState<'all' | 'blocked' | 'ready' | 'parts'>('all');
  const [isSavingJobAlignment, setIsSavingJobAlignment] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.error(err);
        toast.error('Unable to enter fullscreen mode');
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false));
      }
    }
  };

  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  // Firestore real-time collections
  const [jobs, setJobs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  // Setup Real-time Firestore Listeners
  useEffect(() => {
    if (!tenantId) return;

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const qTasks = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId)
    );
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      setTasks(filteredDocs.map(doc => {
        const pathParts = doc.ref.path.split('/');
        const jobId = pathParts[3];
        return {
          id: doc.id,
          jobId,
          ...(doc.data() as any)
        };
      }));
    });

    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), (snap) => {
      setParts(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubSessions = onSnapshot(collection(db, `businesses/${tenantId}/timecard_sessions`), (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    return () => {
      unsubJobs();
      unsubVehicles();
      unsubZones();
      unsubTasks();
      unsubParts();
      unsubStaff();
      unsubDepts();
      unsubSessions();
    };
  }, [tenantId]);

  // Compute search options for the print bullet points list
  const searchJobs = useMemo(() => {
    const worksheetJobs = jobs.filter(job => {
      const jobTasks = tasks.filter(t => t.jobId === job.id);
      
      if (['Completed', 'Closed'].includes(job.status)) return false;

      const resolvedLocationId = zones.find(z => z.currentJobId === job.id)?.id || job.bayId;
      const hasBay = !!resolvedLocationId && resolvedLocationId !== 'none';
      
      const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
      const totalTasks = nonGeneralTasks.length;
      const completedTasks = nonGeneralTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed').length;
      const hasTasksNeedingDone = totalTasks > completedTasks;
      const hasQCNeedingDone = nonGeneralTasks.some(t => t.status === 'QC' || t.status === 'in_review');
      const isReadyForCustomer = job.status === 'Ready for Customer';
      const isReadyForQC = job.status === 'Ready for QC' || job.status === 'QC' || job.status === 'QC Complete';

      return hasBay || hasTasksNeedingDone || hasQCNeedingDone || isReadyForCustomer || isReadyForQC;
    });

    return worksheetJobs.map(job => {
      const vehicle = vehicles.find(v => v.vin === job.vehicleId || v.id === job.vehicleId);
      const vehLabel = vehicle 
        ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() 
        : job.vehicleId || '';

      const label = `#${job.jobNumber || ''} - ${job.title} ${vehLabel ? `(${vehLabel})` : ''}`.trim();
      return { id: job.id, label };
    });
  }, [jobs, tasks, vehicles, zones]);

  // Load meeting dates list
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, `businesses/${tenantId}/weekly_meetings`),
      orderBy('meetingDate', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const dates = snap.docs.map(d => ({
        id: d.id,
        meetingDate: d.data().meetingDate || d.id
      }));
      setMeetingsList(dates);
      setMeetingsLoading(false);

      // Auto-select latest meeting if none selected
      if (dates.length > 0 && !selectedMeetingId) {
        setSelectedMeetingId(dates[0].id);
      } else if (dates.length === 0 && !selectedMeetingId) {
        // Create an initial template for today's date if no meetings exist at all
        const todayStr = new Date().toISOString().split('T')[0];
        setSelectedMeetingId(todayStr);
        setMeetingData(createEmptyMeetingData(todayStr));
      }
    }, (err) => {
      console.error("Error fetching weekly meetings list:", err);
      setMeetingsLoading(false);
    });

    return () => unsub();
  }, [tenantId]);

  // Load selected meeting document
  useEffect(() => {
    if (!tenantId || !selectedMeetingId) return;

    const loadMeeting = async () => {
      try {
        const docRef = doc(db, `businesses/${tenantId}/weekly_meetings`, selectedMeetingId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setMeetingData({ id: snap.id, ...snap.data() } as MeetingData);
        } else {
          // If doc doesn't exist yet, seed it with template
          setMeetingData(createEmptyMeetingData(selectedMeetingId));
        }
      } catch (err) {
        console.error("Error loading meeting details:", err);
        toast.error("Failed to load meeting details");
      }
    };

    loadMeeting();
  }, [tenantId, selectedMeetingId]);

  // Handle Input Changes
  const handleListChange = (
    section: 'salesPipeline' | 'openSalesOrders' | 'serviceWork' | 'buildSchedule' | 'orders' | 'misc',
    subSection: string | null,
    index: number,
    value: string
  ) => {
    if (!meetingData) return;

    setMeetingData((prev: any) => {
      if (!prev) return null;
      const copy = { ...prev };
      
      if (section === 'misc') {
        const list = [...(copy.misc || [])];
        list[index] = value;
        copy.misc = list;
      } else if (subSection) {
        const secCopy = { ...copy[section] };
        const subList = [...(secCopy[subSection] || [])];
        subList[index] = value;
        secCopy[subSection] = subList;
        copy[section] = secCopy;
      }
      
      return copy;
    });
  };

  // Add Item Line
  const handleAddItem = (
    section: 'salesPipeline' | 'openSalesOrders' | 'serviceWork' | 'buildSchedule' | 'orders' | 'misc',
    subSection: string | null
  ) => {
    if (!meetingData) return;

    setMeetingData((prev: any) => {
      if (!prev) return null;
      const copy = { ...prev };

      if (section === 'misc') {
        copy.misc = [...(copy.misc || []), ''];
      } else if (subSection) {
        const secCopy = { ...copy[section] };
        secCopy[subSection] = [...(secCopy[subSection] || []), ''];
        copy[section] = secCopy;
      }

      return copy;
    });
  };

  // Remove Item Line
  const handleRemoveItem = (
    section: 'salesPipeline' | 'openSalesOrders' | 'serviceWork' | 'buildSchedule' | 'orders' | 'misc',
    subSection: string | null,
    index: number
  ) => {
    if (!meetingData) return;

    setMeetingData((prev: any) => {
      if (!prev) return null;
      const copy = { ...prev };

      if (section === 'misc') {
        const list = [...(copy.misc || [])];
        list.splice(index, 1);
        copy.misc = list;
      } else if (subSection) {
        const secCopy = { ...copy[section] };
        const subList = [...(secCopy[subSection] || [])];
        subList.splice(index, 1);
        secCopy[subSection] = subList;
        copy[section] = secCopy;
      }

      return copy;
    });
  };

  // Save Notes
  const handleSaveNotes = async () => {
    if (!tenantId || !meetingData) return;
    setIsSaving(true);

    try {
      const docRef = doc(db, `businesses/${tenantId}/weekly_meetings`, meetingData.id);
      await setDoc(docRef, {
        ...meetingData,
        updatedAt: serverTimestamp(),
        createdAt: meetingData.createdAt || serverTimestamp()
      }, { merge: true });

      toast.success("Meeting notes saved successfully");
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Notes
  const handleDeleteMeeting = async (id: string, date: string) => {
    if (!canManage) return;
    if (!window.confirm(`Are you sure you want to permanently delete the meeting notes for ${date}?`)) return;

    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/weekly_meetings`, id));
      toast.success("Meeting notes deleted");
      if (selectedMeetingId === id) {
        setSelectedMeetingId(meetingsList.find(m => m.id !== id)?.id || null);
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete meeting notes");
    }
  };

  // Create New Meeting Notes
  const handleCreateNewMeeting = () => {
    setShowDatePickerModal(false);
    setSelectedMeetingId(newMeetingDate);
    setMeetingData(createEmptyMeetingData(newMeetingDate));
    toast.info(`Created template for ${newMeetingDate}. Press Save to persist.`);
  };

  // Smart Auto-Populate from system jobs and zones
  const handleAutoPopulate = async () => {
    if (!tenantId || !meetingData) return;
    setIsAutoPopulating(true);

    try {
      // 1. Fetch active jobs, zones, vehicles, departments, tasks, and parts requests in parallel
      const [jobsSnap, zonesSnap, vehiclesSnap, deptsSnap, tasksSnap, partsSnap] = await Promise.all([
        getDocs(collection(db, `businesses/${tenantId}/jobs`)),
        getDocs(collection(db, `businesses/${tenantId}/zones`)),
        getDocs(collection(db, `businesses/${tenantId}/vehicles`)),
        getDocs(collection(db, `businesses/${tenantId}/departments`)),
        getDocs(query(collectionGroup(db, 'tasks'), where('tenantId', '==', tenantId))),
        getDocs(collection(db, `businesses/${tenantId}/parts_requests`))
      ]);

      const jobs = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const zones = zonesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const vehicles = vehiclesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const departments = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const partsRequests = partsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const filteredTasksDocs = tasksSnap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      const allTasks = filteredTasksDocs.map(doc => {
        const pathParts = doc.ref.path.split('/');
        const jobId = pathParts[3];
        return {
          id: doc.id,
          jobId,
          ...(doc.data() as any)
        };
      });

      const activeJobs = jobs.filter(job => {
        const jobTasks = allTasks.filter(t => t.jobId === job.id);
        
        // Exact filter matching JobsWorksheet.tsx
        if (['Completed', 'Closed'].includes(job.status)) return false;

        const resolvedLocationId = zones.find(z => z.currentJobId === job.id)?.id || job.bayId;
        const hasBay = !!resolvedLocationId && resolvedLocationId !== 'none';
        
        const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
        const totalTasks = nonGeneralTasks.length;
        const completedTasks = nonGeneralTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed').length;
        const hasTasksNeedingDone = totalTasks > completedTasks;
        const hasQCNeedingDone = nonGeneralTasks.some(t => t.status === 'QC' || t.status === 'in_review');
        const isReadyForCustomer = job.status === 'Ready for Customer';
        const isReadyForQC = job.status === 'Ready for QC' || job.status === 'QC' || job.status === 'QC Complete';

        return hasBay || hasTasksNeedingDone || hasQCNeedingDone || isReadyForCustomer || isReadyForQC;
      });
      const serviceDept = departments.find((d: any) => d.name?.toLowerCase() === 'service');
      const upfitDept = departments.find((d: any) => d.name?.toLowerCase().includes('upfit'));

      const isServiceJob = (job: any) => {
        if (serviceDept && job.departmentIds?.includes(serviceDept.id)) return true;
        if (upfitDept && job.departmentIds?.includes(upfitDept.id)) return false;
        
        const titleLower = String(job.title || '').toLowerCase();
        const descLower = String(job.description || '').toLowerCase();
        
        const serviceKeywords = ['service', 'repair', 'diagnostic', 'diagnose', 'diagnosis', 'maintenance', 'warranty', 'diagnos', 'troubleshoot'];
        return serviceKeywords.some(keyword => titleLower.includes(keyword) || descLower.includes(keyword));
      };

      // Separate builds vs service
      const buildJobs = activeJobs.filter(j => !isServiceJob(j));
      const serviceJobs = activeJobs.filter(j => isServiceJob(j));

      // Helper to match vehicle display
      const getVehicleLabel = (job: any) => {
        if (!job.vehicleId) return '';
        const vehicle = vehicles.find((v: any) => v.vin === job.vehicleId || v.id === job.vehicleId);
        return vehicle 
          ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() 
          : job.vehicleId;
      };

      // Helper to resolve exact physical location and sorting priority
      const getZoneInfo = (job: any) => {
        const zone = zones.find(z => 
          z.currentJobId === job.id || 
          (job.vehicleId && z.currentVehicleVin === job.vehicleId) ||
          (job.bayId && (job.bayId === z.id || job.bayId === z.name))
        );
        if (!zone) return { label: '[Not Checked In]', score: 3 };
        const isBay = zone.type === 'bay';
        return {
          label: `[${isBay ? 'Bay' : 'Parked'}: ${zone.name}]`,
          score: isBay ? 1 : 2
        };
      };

      // 2. Build Schedule: In Shop
      // Build/Upfit jobs that are either checked in or have active status
      const inShopList = buildJobs
        .filter((job: any) => {
          const zoneInfo = getZoneInfo(job);
          const isCheckedIn = zoneInfo.score < 3;
          const isActive = ['Active', 'In Progress', 'Blocked'].includes(job.status);
          return isCheckedIn || isActive;
        })
        .map((job: any) => {
          const veh = getVehicleLabel(job);
          const zoneInfo = getZoneInfo(job);
          const completionDate = job.expectedFinishTime 
            ? new Date(job.expectedFinishTime.seconds ? job.expectedFinishTime.seconds * 1000 : job.expectedFinishTime).toLocaleDateString([], { month: '2-digit', day: '2-digit' })
            : 'No ETA';
          const statusLabel = job.status || 'Active';
          return {
            text: `#${job.jobNumber || ''} - ${zoneInfo.label} ${job.title} (${veh}) [${statusLabel}] [ETA: ${completionDate}]`,
            score: zoneInfo.score
          };
        })
        .sort((a, b) => a.score - b.score)
        .map(item => item.text)
        .slice(0, 12);

      while (inShopList.length < 10) inShopList.push('');

      // 3. Build Schedule: Incoming upon Completion
      // Upfitting/Build jobs with status 'Ready for QC', 'QC', or 'QC Complete'
      const qcJobs = buildJobs.filter((j: any) => j.status === 'Ready for QC' || j.status === 'QC' || j.status === 'QC Complete');
      const incomingCompletionList = qcJobs
        .map((job: any) => {
          const veh = getVehicleLabel(job);
          const zoneInfo = getZoneInfo(job);
          const statusLabel = job.status || 'QC';
          return {
            text: `#${job.jobNumber || ''} - ${zoneInfo.label} ${job.title} (${veh}) [${statusLabel}]`,
            score: zoneInfo.score
          };
        })
        .sort((a, b) => a.score - b.score)
        .map(item => item.text)
        .slice(0, 12);

      while (incomingCompletionList.length < 10) incomingCompletionList.push('');

      // 4. Service Work: In Progress
      // Service jobs that are active (Active, In Progress, Blocked)
      const serviceInProgress = serviceJobs
        .filter((j: any) => j.status === 'Active' || j.status === 'In Progress' || j.status === 'Blocked')
        .map((job: any) => {
          const veh = getVehicleLabel(job);
          const zoneInfo = getZoneInfo(job);
          const statusLabel = job.status || 'Active';
          return {
            text: `#${job.jobNumber || ''} - ${zoneInfo.label} ${job.title} (${veh}) [${statusLabel}]`,
            score: zoneInfo.score
          };
        })
        .sort((a, b) => a.score - b.score)
        .map(item => item.text)
        .slice(0, 8);

      while (serviceInProgress.length < 3) serviceInProgress.push('');

      // 5. Service Work: Need to Start
      // Service jobs that are physically on-site (checked into a bay/parking spot) but not yet active
      const serviceNeedToStart = serviceJobs
        .filter((job: any) => {
          const isPending = job.status === 'Open' || job.status === 'Scheduled';
          const zoneInfo = getZoneInfo(job);
          const isHere = zoneInfo.score < 3;
          return isPending && isHere;
        })
        .map((job: any) => {
          const veh = getVehicleLabel(job);
          const zoneInfo = getZoneInfo(job);
          return {
            text: `#${job.jobNumber || ''} - ${zoneInfo.label} ${job.title} (${veh}) [${job.status || 'Pending'}]`,
            score: zoneInfo.score
          };
        })
        .sort((a, b) => a.score - b.score)
        .map(item => item.text)
        .slice(0, 8);

      while (serviceNeedToStart.length < 3) serviceNeedToStart.push('');

      // 6. Service Work: Incoming
      // Service jobs scheduled to arrive in the future
      const now = new Date();
      const serviceIncoming = serviceJobs
        .filter((j: any) => {
          if (!j.scheduledArrivalTime) return false;
          const arrDate = new Date(j.scheduledArrivalTime.seconds ? j.scheduledArrivalTime.seconds * 1000 : j.scheduledArrivalTime);
          return arrDate > now;
        })
        .map((job: any) => {
          const veh = getVehicleLabel(job);
          const zoneInfo = getZoneInfo(job);
          const dateStr = new Date(job.scheduledArrivalTime.seconds ? job.scheduledArrivalTime.seconds * 1000 : job.scheduledArrivalTime).toLocaleDateString([], { month: '2-digit', day: '2-digit' });
          const locStr = zoneInfo.score < 3 ? ` ${zoneInfo.label}` : ' [Incoming]';
          return `#${job.jobNumber || ''} -${locStr} ${job.title} (${veh}) [Arr: ${dateStr}]`;
        })
        .slice(0, 8);

      while (serviceIncoming.length < 3) serviceIncoming.push('');

      // 7. Service Work: Need to Schedule
      // Service jobs that are open but have no scheduled arrival/start times and are not checked in
      const serviceNeedToSchedule = serviceJobs
        .filter((job: any) => {
          const zoneInfo = getZoneInfo(job);
          const isNotCheckedIn = zoneInfo.score === 3;
          const isNotScheduled = !job.scheduledArrivalTime && !job.scheduledStartDate;
          return job.status === 'Open' && isNotCheckedIn && isNotScheduled;
        })
        .map((job: any) => {
          const veh = getVehicleLabel(job);
          return `#${job.jobNumber || ''} - [Needs Schedule] ${job.title} (${veh})`;
        })
        .slice(0, 8);

      while (serviceNeedToSchedule.length < 3) serviceNeedToSchedule.push('');

      // 8. Open Sales Orders: 1 - 30 Days (Builds only - not yet in shop)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const days1to30List = buildJobs
        .filter((j: any) => {
          if (!j.createdAt) return false;
          const created = new Date(j.createdAt.seconds ? j.createdAt.seconds * 1000 : j.createdAt);
          if (created < thirtyDaysAgo) return false;

          // Exclude if already in shop
          const zoneInfo = getZoneInfo(j);
          const isCheckedIn = zoneInfo.score < 3;
          const isActive = ['Active', 'In Progress', 'Blocked'].includes(j.status);
          return !isCheckedIn && !isActive;
        })
        .map((job: any) => {
          const veh = getVehicleLabel(job);
          const zoneInfo = getZoneInfo(job);
          const statusLabel = job.status || 'Active';
          return {
            text: `#${job.jobNumber || ''} - ${zoneInfo.label} ${job.title} (${veh}) [${statusLabel}]`,
            score: zoneInfo.score
          };
        })
        .sort((a, b) => a.score - b.score)
        .map(item => item.text)
        .slice(0, 6);

      while (days1to30List.length < 3) days1to30List.push('');

      // 9. Open Sales Orders: 31 - 60 Days (Builds only - not yet in shop)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const days31to60List = buildJobs
        .filter((j: any) => {
          if (!j.createdAt) return false;
          const created = new Date(j.createdAt.seconds ? j.createdAt.seconds * 1000 : j.createdAt);
          if (created < sixtyDaysAgo || created >= thirtyDaysAgo) return false;

          // Exclude if already in shop
          const zoneInfo = getZoneInfo(j);
          const isCheckedIn = zoneInfo.score < 3;
          const isActive = ['Active', 'In Progress', 'Blocked'].includes(j.status);
          return !isCheckedIn && !isActive;
        })
        .map((job: any) => {
          const veh = getVehicleLabel(job);
          const zoneInfo = getZoneInfo(job);
          const statusLabel = job.status || 'Active';
          return {
            text: `#${job.jobNumber || ''} - ${zoneInfo.label} ${job.title} (${veh}) [${statusLabel}]`,
            score: zoneInfo.score
          };
        })
        .sort((a, b) => a.score - b.score)
        .map(item => item.text)
        .slice(0, 6);

      while (days31to60List.length < 3) days31to60List.push('');

      // 10. Parts requests lists
      const activeParts = partsRequests.filter((p: any) => !p.isArchived && (p.status === 'pending' || p.status === 'ordered'));
      
      const getPartsLabel = (req: any) => {
        const qty = req.quantity || 1;
        const urgencyStr = req.urgency === 'urgent' ? '[URGENT] ' : '';
        const statusStr = req.status === 'ordered' ? '[Ordered] ' : '[Pending] ';
        
        if (req.jobId && req.jobId !== 'none') {
          const job = jobs.find((j: any) => j.id === req.jobId);
          if (job) {
            const veh = getVehicleLabel(job);
            const jobNumStr = job.jobNumber ? `#${job.jobNumber} ` : '';
            return `${urgencyStr}${statusStr}${qty}x ${req.partName} (${jobNumStr}${job.title} - ${veh})`;
          }
        }
        return `${urgencyStr}${statusStr}${qty}x ${req.partName} (Restock - Req by ${req.requestedBy || 'Staff'})`;
      };

      const inShopJobIds = new Set<string>();
      jobs.forEach((j: any) => {
        if (['Completed', 'Closed'].includes(j.status)) return;
        const zoneInfo = getZoneInfo(j);
        const isCheckedIn = zoneInfo.score < 3;
        const isActive = ['Active', 'In Progress', 'Blocked'].includes(j.status);
        if (isCheckedIn || isActive) {
          inShopJobIds.add(j.id);
        }
      });

      const neededJobCompletionsList = activeParts
        .filter((p: any) => p.jobId && p.jobId !== 'none' && inShopJobIds.has(p.jobId))
        .map(p => getPartsLabel(p))
        .slice(0, 6);
      while (neededJobCompletionsList.length < 3) neededJobCompletionsList.push('');

      const neededUpcomingJobsList = activeParts
        .filter((p: any) => p.jobId && p.jobId !== 'none' && !inShopJobIds.has(p.jobId))
        .map(p => getPartsLabel(p))
        .slice(0, 6);
      while (neededUpcomingJobsList.length < 3) neededUpcomingJobsList.push('');

      const restockOrdersList = activeParts
        .filter((p: any) => !p.jobId || p.jobId === 'none')
        .map(p => getPartsLabel(p))
        .slice(0, 6);
      while (restockOrdersList.length < 3) restockOrdersList.push('');

      // Update State
      setMeetingData((prev: any) => {
        if (!prev) return null;
        return {
          ...prev,
          buildSchedule: {
            inShop: inShopList,
            incomingCompletion: incomingCompletionList
          },
          serviceWork: {
            ...prev.serviceWork,
            inProgress: serviceInProgress,
            needToStart: serviceNeedToStart,
            incoming: serviceIncoming,
            needToSchedule: serviceNeedToSchedule
          },
          openSalesOrders: {
            days1to30: days1to30List,
            days31to60: days31to60List
          },
          orders: {
            neededJobCompletions: neededJobCompletionsList,
            neededUpcomingJobs: neededUpcomingJobsList,
            restockOrders: restockOrdersList
          }
        };
      });

      toast.success("Successfully imported active jobs into meeting notes!");
    } catch (err: any) {
      console.error("Auto populate error:", err);
      toast.error(`Auto-populate failed: ${err.message}`);
    } finally {
      setIsAutoPopulating(false);
    }
  };

  // Open browser print interface
  const handlePrint = () => {
    window.print();
  };

  // Save Job specific meeting notes and alignment flags
  const handleSaveJobAlignment = async (jobId: string, alignmentData: {
    weeklyMeetingNotes?: string;
    isMissingParts?: boolean;
    isScopeUnclear?: boolean;
    isReadyForShop?: boolean;
    status?: string;
  }) => {
    if (!tenantId || !jobId) return;
    setIsSavingJobAlignment(true);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      await updateDoc(jobRef, alignmentData);
      toast.success("Job alignment updated successfully!");
    } catch (err: any) {
      console.error("Error saving job alignment:", err);
      toast.error(`Failed to save job alignment: ${err.message}`);
    } finally {
      setIsSavingJobAlignment(false);
    }
  };

  // Format date display
  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      return d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  if (meetingsLoading) {
    return (
      <div className="h-full flex items-center justify-center p-12 text-zinc-400">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
        Loading weekly meeting logs...
      </div>
    );
  }

  return (
    <div className={cn(
      "h-full flex flex-col lg:flex-row bg-zinc-50 dark:bg-zinc-950 font-sans select-none relative overflow-hidden",
      isFullscreen && "fixed inset-0 z-[99999] p-4 overflow-hidden w-screen h-screen m-0 bg-zinc-950 flex-row"
    )}>

      {/* Floating Exit Fullscreen Button */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="fixed top-4 right-4 z-[100000] flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900/90 hover:bg-zinc-800 text-white rounded-xl text-xs font-black shadow-2xl backdrop-blur-md border border-zinc-700/60 transition active:scale-95 opacity-80 hover:opacity-100"
          title="Exit Fullscreen (or press Esc)"
        >
          <Minimize2 className="w-4 h-4 text-indigo-400" />
          <span>Exit Fullscreen</span>
        </button>
      )}
      
      {/* ----------------------------------------------------
          SIDEBAR: PAST MEETINGS & SELECTION
      ---------------------------------------------------- */}
      {!isFullscreen && (
        <div className="w-full lg:w-64 bg-white dark:bg-zinc-900 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-4 no-print shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4 text-indigo-500" />
            Weekly Notes
          </h2>
          <button
            onClick={() => setShowDatePickerModal(true)}
            className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition active:scale-95 shadow-sm"
            title="Create New Meeting Notes"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar max-h-48 lg:max-h-none space-y-1">
          {meetingsList.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400 italic">No meetings saved yet.</div>
          ) : (
            meetingsList.map((m) => {
              const isActive = selectedMeetingId === m.id;
              return (
                <div 
                  key={m.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-xl transition duration-200 group/item cursor-pointer",
                    isActive 
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20" 
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300"
                  )}
                  onClick={() => setSelectedMeetingId(m.id)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs font-bold truncate leading-none">{m.meetingDate}</span>
                  </div>
                  {canManage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMeeting(m.id, m.meetingDate);
                      }}
                      className="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 opacity-0 group-hover/item:opacity-100 transition-opacity rounded"
                      title="Delete notes"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* ----------------------------------------------------
          MAIN DOCUMENT WORKBOARD
      ---------------------------------------------------- */}
      <div className={cn(
        "flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar relative min-w-0",
        isFullscreen && "p-2 h-screen overflow-hidden flex flex-col"
      )}>
        
        {/* Editor Floating Actions Bar */}
        {!isFullscreen && (
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm mb-6 no-print">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2">
                Weekly Meeting
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Current Meeting: <strong className="text-indigo-500">{selectedMeetingId || '--'}</strong>
              </p>
            </div>
            
            {/* View Mode Toggle */}
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl shrink-0 border border-zinc-200/50 dark:border-zinc-700/50">
              <button
                onClick={() => setViewMode('bay_jobs')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition duration-200 flex items-center gap-1.5",
                  viewMode === 'bay_jobs' 
                    ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-350"
                )}
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                Jobs in Bay
              </button>
              <button
                onClick={() => setViewMode('print')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition duration-200",
                  viewMode === 'print' 
                    ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-350"
                )}
              >
                Print Document
              </button>
            </div>

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Display"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-extrabold transition-all border border-zinc-200 dark:border-zinc-700/80 active:scale-95 shrink-0"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-indigo-500" /> : <Maximize2 className="w-3.5 h-3.5 text-indigo-500" />}
              <span className="hidden sm:inline">
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {viewMode === 'print' ? (
              <>
                <button
                  onClick={handleAutoPopulate}
                  disabled={isAutoPopulating || !meetingData}
                  className="flex items-center gap-1.5 px-4.5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-750 dark:text-zinc-300 rounded-xl text-xs font-black transition shadow-sm active:scale-95 disabled:opacity-50 shrink-0"
                  title="Pull active jobs and vehicles into meeting sheets"
                >
                  {isAutoPopulating ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  )}
                  Auto-Populate
                </button>

                <button
                  onClick={handlePrint}
                  disabled={!meetingData}
                  className="flex items-center gap-1.5 px-4.5 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-black transition shadow-sm active:scale-95 shrink-0"
                  title="Print layout matching PDF template"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Notes
                </button>

                <button
                  onClick={handleSaveNotes}
                  disabled={isSaving || !meetingData}
                  className="flex items-center gap-1.5 px-4.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition shadow-md active:scale-95 disabled:opacity-50 shrink-0"
                >
                  {isSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Notes
                </button>
              </>
            ) : (
              <div className="text-xs text-zinc-400 font-medium italic">
                Saves are written directly to job files
              </div>
            )}
          </div>
        </div>
      )}

        {/* ----------------------------------------------------
            THE WEEKLY MEETING CONTENT
        ---------------------------------------------------- */}
        {viewMode === 'bay_jobs' ? (
          <BayJobsView
            tenantId={tenantId}
            jobs={jobs}
            tasks={tasks}
            vehicles={vehicles}
            zones={zones}
            departments={departments}
            staff={staff}
            sessions={sessions}
            onSaveJobAlignment={handleSaveJobAlignment}
            isSavingJobAlignment={isSavingJobAlignment}
            isFullscreen={isFullscreen}
          />
        ) : meetingData ? (
          viewMode === 'print' ? (
            <div className="print-container w-full max-w-4xl mx-auto space-y-12">
            
            {/* ================= PAGE 1 ================= */}
            <div className="print-page bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-3xl p-6 sm:p-12 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between">
              
              {/* Header */}
              <div className="border-b-4 border-zinc-900 pb-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <h1 className="text-3xl font-extrabold uppercase tracking-widest text-zinc-900 dark:text-white">
                  Weekly Meeting
                </h1>
                <div className="text-right">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Meeting Date</p>
                  <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{formatDate(meetingData.meetingDate)}</p>
                </div>
              </div>

              {/* Sections Container */}
              <div className="flex-1 space-y-8">
                
                {/* 1. Sales Pipeline */}
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-400" />
                    Sales Pipe Line
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-4">
                    
                    {/* Leads */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Leads</h3>
                      <BulletListEditor 
                        items={meetingData.salesPipeline.leads} 
                        onChange={(idx, val) => handleListChange('salesPipeline', 'leads', idx, val)}
                        onAdd={() => handleAddItem('salesPipeline', 'leads')}
                        onRemove={(idx) => handleRemoveItem('salesPipeline', 'leads', idx)}
                      />
                    </div>

                    {/* Prospecting */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Prospecting</h3>
                      <BulletListEditor 
                        items={meetingData.salesPipeline.prospecting} 
                        onChange={(idx, val) => handleListChange('salesPipeline', 'prospecting', idx, val)}
                        onAdd={() => handleAddItem('salesPipeline', 'prospecting')}
                        onRemove={(idx) => handleRemoveItem('salesPipeline', 'prospecting', idx)}
                      />
                    </div>

                    {/* Waiting on approval */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Waiting on approval / Follow up on</h3>
                      <BulletListEditor 
                        items={meetingData.salesPipeline.waitingApproval} 
                        onChange={(idx, val) => handleListChange('salesPipeline', 'waitingApproval', idx, val)}
                        onAdd={() => handleAddItem('salesPipeline', 'waitingApproval')}
                        onRemove={(idx) => handleRemoveItem('salesPipeline', 'waitingApproval', idx)}
                      />
                    </div>

                    {/* Approved */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Approved</h3>
                      <BulletListEditor 
                        items={meetingData.salesPipeline.approved} 
                        onChange={(idx, val) => handleListChange('salesPipeline', 'approved', idx, val)}
                        onAdd={() => handleAddItem('salesPipeline', 'approved')}
                        onRemove={(idx) => handleRemoveItem('salesPipeline', 'approved', idx)}
                      />
                    </div>

                  </div>
                </div>

                {/* 2. Open Sales Orders */}
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-400" />
                    Open Sales Orders
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-4">
                    
                    {/* 1-30 Days */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">1 - 30 Days</h3>
                      <BulletListEditor 
                        items={meetingData.openSalesOrders.days1to30} 
                        onChange={(idx, val) => handleListChange('openSalesOrders', 'days1to30', idx, val)}
                        onAdd={() => handleAddItem('openSalesOrders', 'days1to30')}
                        onRemove={(idx) => handleRemoveItem('openSalesOrders', 'days1to30', idx)}
                      />
                    </div>

                    {/* 31-60 Days */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">31 - 60 Days</h3>
                      <BulletListEditor 
                        items={meetingData.openSalesOrders.days31to60} 
                        onChange={(idx, val) => handleListChange('openSalesOrders', 'days31to60', idx, val)}
                        onAdd={() => handleAddItem('openSalesOrders', 'days31to60')}
                        onRemove={(idx) => handleRemoveItem('openSalesOrders', 'days31to60', idx)}
                      />
                    </div>

                  </div>
                </div>

                {/* 3. Service Work (Part 1 - Here in-progress) */}
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-400" />
                    Service Work
                  </h2>
                  <div className="pl-4">
                    <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Here in-progress</h3>
                    <BulletListEditor 
                      items={meetingData.serviceWork.inProgress} 
                      onChange={(idx, val) => handleListChange('serviceWork', 'inProgress', idx, val)}
                      onAdd={() => handleAddItem('serviceWork', 'inProgress')}
                      onRemove={(idx) => handleRemoveItem('serviceWork', 'inProgress', idx)}
                    />
                  </div>
                </div>

              </div>
              
              <div className="text-[9px] text-zinc-400 dark:text-zinc-500 text-center mt-8 border-t border-zinc-100 dark:border-zinc-800 pt-2 no-print">
                📄 Page 1 of 3 (Sales Pipeline & Open Sales Orders)
              </div>
            </div>

            {/* ================= PAGE 2 ================= */}
            <div className="print-page bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-3xl p-6 sm:p-12 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between">
              <div className="flex-1 space-y-8">
                
                {/* Service Work (Continued) */}
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-400" />
                    Service Work (Continued)
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pl-4">
                    
                    {/* Here need to start */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Here need to start</h3>
                      <BulletListEditor 
                        items={meetingData.serviceWork.needToStart} 
                        onChange={(idx, val) => handleListChange('serviceWork', 'needToStart', idx, val)}
                        onAdd={() => handleAddItem('serviceWork', 'needToStart')}
                        onRemove={(idx) => handleRemoveItem('serviceWork', 'needToStart', idx)}
                      />
                    </div>

                    {/* Incoming */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Incoming</h3>
                      <BulletListEditor 
                        items={meetingData.serviceWork.incoming} 
                        onChange={(idx, val) => handleListChange('serviceWork', 'incoming', idx, val)}
                        onAdd={() => handleAddItem('serviceWork', 'incoming')}
                        onRemove={(idx) => handleRemoveItem('serviceWork', 'incoming', idx)}
                      />
                    </div>

                    {/* Need to Schedule */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Need to Schedule</h3>
                      <BulletListEditor 
                        items={meetingData.serviceWork.needToSchedule} 
                        onChange={(idx, val) => handleListChange('serviceWork', 'needToSchedule', idx, val)}
                        onAdd={() => handleAddItem('serviceWork', 'needToSchedule')}
                        onRemove={(idx) => handleRemoveItem('serviceWork', 'needToSchedule', idx)}
                      />
                    </div>

                  </div>
                </div>

                {/* 4. Build Schedule */}
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-400" />
                    Build Schedule
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-4">
                    
                    {/* In shop / Completion date / Current Times */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">In shop / Completion date / Current Times</h3>
                      <BulletListEditor 
                        items={meetingData.buildSchedule.inShop} 
                        onChange={(idx, val) => handleListChange('buildSchedule', 'inShop', idx, val)}
                        onAdd={() => handleAddItem('buildSchedule', 'inShop')}
                        onRemove={(idx) => handleRemoveItem('buildSchedule', 'inShop', idx)}
                      />
                    </div>

                    {/* Incoming upon Completion */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Incoming upon Completion</h3>
                      <BulletListEditor 
                        items={meetingData.buildSchedule.incomingCompletion} 
                        onChange={(idx, val) => handleListChange('buildSchedule', 'incomingCompletion', idx, val)}
                        onAdd={() => handleAddItem('buildSchedule', 'incomingCompletion')}
                        onRemove={(idx) => handleRemoveItem('buildSchedule', 'incomingCompletion', idx)}
                      />
                    </div>

                  </div>
                </div>

              </div>

              <div className="text-[9px] text-zinc-400 dark:text-zinc-500 text-center mt-8 border-t border-zinc-100 dark:border-zinc-800 pt-2 no-print">
                📄 Page 2 of 3 (Service Work & Build Schedule)
              </div>
            </div>

            {/* ================= PAGE 3 ================= */}
            <div className="print-page bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-3xl p-6 sm:p-12 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between">
              <div className="flex-1 space-y-8">
                
                {/* 5. Orders */}
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-400" />
                    Orders
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pl-4">
                    
                    {/* Needed for job completions */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Needed for job completions</h3>
                      <BulletListEditor 
                        items={meetingData.orders.neededJobCompletions} 
                        onChange={(idx, val) => handleListChange('orders', 'neededJobCompletions', idx, val)}
                        onAdd={() => handleAddItem('orders', 'neededJobCompletions')}
                        onRemove={(idx) => handleRemoveItem('orders', 'neededJobCompletions', idx)}
                      />
                    </div>

                    {/* Needed for upcoming jobs */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Needed for upcoming jobs</h3>
                      <BulletListEditor 
                        items={meetingData.orders.neededUpcomingJobs} 
                        onChange={(idx, val) => handleListChange('orders', 'neededUpcomingJobs', idx, val)}
                        onAdd={() => handleAddItem('orders', 'neededUpcomingJobs')}
                        onRemove={(idx) => handleRemoveItem('orders', 'neededUpcomingJobs', idx)}
                      />
                    </div>

                    {/* Restock Orders needed */}
                    <div>
                      <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2">Restock Orders needed</h3>
                      <BulletListEditor 
                        items={meetingData.orders.restockOrders} 
                        onChange={(idx, val) => handleListChange('orders', 'restockOrders', idx, val)}
                        onAdd={() => handleAddItem('orders', 'restockOrders')}
                        onRemove={(idx) => handleRemoveItem('orders', 'restockOrders', idx)}
                      />
                    </div>

                  </div>
                </div>

                {/* 6. Misc. */}
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-400" />
                    Misc.
                  </h2>
                  <div className="pl-4">
                    <BulletListEditor 
                      items={meetingData.misc} 
                      onChange={(idx, val) => handleListChange('misc', null, idx, val)}
                      onAdd={() => handleAddItem('misc', null)}
                      onRemove={(idx) => handleRemoveItem('misc', null, idx)}
                      symbol="-"
                    />
                  </div>
                </div>

                {/* 7. Notes */}
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-2 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-400" />
                    Notes
                  </h2>
                  <textarea
                    value={meetingData.notes || ''}
                    onChange={(e) => setMeetingData(prev => prev ? ({ ...prev, notes: e.target.value }) : null)}
                    placeholder="Type meeting notes/actions here..."
                    className="w-full min-h-[160px] p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:border-indigo-500 font-medium text-xs dark:text-white leading-relaxed resize-y placeholder:italic"
                  />
                </div>

              </div>

              <div className="text-[9px] text-zinc-400 dark:text-zinc-500 text-center mt-8 border-t border-zinc-100 dark:border-zinc-800 pt-2 no-print">
                📄 Page 3 of 3 (Orders, Misc & Notes)
              </div>
            </div>

          </div>
        ) : (
          <InteractiveBoardView
            tenantId={tenantId}
            jobs={jobs}
            tasks={tasks}
            vehicles={vehicles}
            zones={zones}
            parts={parts}
            staff={staff}
            onSaveJobAlignment={handleSaveJobAlignment}
            isSavingJobAlignment={isSavingJobAlignment}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            blockerFilter={blockerFilter}
            setBlockerFilter={setBlockerFilter}
            selectedBoardJobId={selectedBoardJobId}
            setSelectedBoardJobId={setSelectedBoardJobId}
          />
        )
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center rounded-2xl">
          <ClipboardList className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
          <h3 className="font-bold text-zinc-900 dark:text-white text-base">Select or Create Meeting</h3>
          <p className="text-zinc-500 text-xs mt-2">Select a date from the weekly list or click "+" to start fresh.</p>
        </div>
      )}

      </div>

      {/* ----------------------------------------------------
          DATE PICKER MODAL
      ---------------------------------------------------- */}
      {showDatePickerModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200 no-print" onClick={() => setShowDatePickerModal(false)}>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden max-w-xs w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-955 flex items-center justify-between">
              <h3 className="font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wider">New Meeting Date</h3>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="date"
                value={newMeetingDate}
                onChange={(e) => setNewMeetingDate(e.target.value)}
                className="w-full p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none text-xs font-bold text-center dark:text-white cursor-pointer"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDatePickerModal(false)}
                  className="flex-1 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNewMeeting}
                  className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-500/20"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <datalist id="weekly-meeting-jobs-list">
        {searchJobs.map((sj, idx) => (
          <option key={sj.id || idx} value={sj.label} />
        ))}
      </datalist>

      {/* ----------------------------------------------------
          PRINT STYLESHEET
      ---------------------------------------------------- */}
      <style>{`
        @media print {
          /* Hide non-print containers */
          .no-print, header, aside, .no-print *, .print-hidden, .print\\:hidden {
            display: none !important;
          }
          
          /* Force plain white paper format and remove layout backgrounds/borders/shadows */
          body, html, #root,
          .h-screen,
          .overflow-hidden,
          div.flex,
          div.flex-1,
          main,
          .print-container {
            background: white !important;
            background-color: white !important;
            color: black !important;
            border: none !important;
            border-width: 0px !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            max-height: none !important;
            position: static !important;
            display: block !important;
          }

          /* Force exact pagination on print pages */
          .print-page {
            page-break-after: always !important;
            page-break-inside: avoid !important;
            background: white !important;
            background-color: white !important;
            color: black !important;
            padding: 1cm !important;
            border: none !important;
            border-width: 0px !important;
            border-style: none !important;
            border-radius: 0px !important;
            box-shadow: none !important;
            min-height: 23.5cm !important;
            width: 100% !important;
            box-sizing: border-box !important;
            display: block !important;
            position: relative !important;
          }

          .print-page:last-of-type {
            page-break-after: avoid !important;
          }

          /* Force all print-page content text to black */
          .print-page h1,
          .print-page h2,
          .print-page h3,
          .print-page p,
          .print-page span,
          .print-page input,
          .print-page textarea,
          .print-bullet-symbol {
            color: black !important;
            -webkit-text-fill-color: black !important;
          }

          /* Hide input placeholders when printing */
          input::placeholder {
            color: transparent !important;
            opacity: 0 !important;
            -webkit-text-fill-color: transparent !important;
          }

          /* Input formatting for clean underline print layout */
          .print-input {
            border: none !important;
            border-bottom: 1.5px solid black !important;
            background: transparent !important;
            color: black !important;
            font-size: 10.5pt !important;
            font-weight: bold !important;
            padding: 1px 0 !important;
            width: 100% !important;
          }

          .print-bullet-line {
            display: flex !important;
            align-items: center !important;
            margin-bottom: 4px !important;
          }

          .print-bullet-symbol {
            font-weight: bold !important;
            margin-right: 8px !important;
            color: black !important;
            font-size: 11pt !important;
          }

          /* Header & Section Underlines */
          .print-page div.border-b-4 {
            border-bottom: 4px solid black !important;
          }

          .print-page h2.border-b {
            border-bottom: 1.5px solid black !important;
            padding-bottom: 2px !important;
            margin-top: 15px !important;
          }

          /* Header Styling */
          .print-page h1 {
            font-size: 20pt !important;
            font-weight: 800 !important;
          }

          .print-page h2 {
            font-size: 11pt !important;
            font-weight: 800 !important;
          }

          .print-page h3 {
            font-size: 9pt !important;
            font-weight: 800 !important;
            margin-bottom: 6px !important;
          }

          .grid {
            display: grid !important;
          }
          
          .grid-cols-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 1.5cm !important;
          }
          
          .grid-cols-3 {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 1.2cm !important;
          }

          /* Print Action Line buttons removal */
          .print-action-btn {
            display: none !important;
          }

          textarea {
            border: 1.5px solid black !important;
            background: transparent !important;
            color: black !important;
            border-radius: 0 !important;
            width: 100% !important;
            min-height: 250px !important;
            padding: 8px !important;
            font-size: 10.5pt !important;
          }
        }
      `}</style>

    </div>
  );
}

// ----------------------------------------------------
// BULLET LIST EDITOR WIDGET
// ----------------------------------------------------
interface BulletListEditorProps {
  items: string[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  symbol?: string;
}

function BulletListEditor({ items = [], onChange, onAdd, onRemove, symbol = '■' }: BulletListEditorProps) {
  return (
    <div className="space-y-1.5">
      {items.map((item, idx) => (
        <div key={idx} className="print-bullet-line flex items-center gap-2 group/line">
          <span className="print-bullet-symbol text-[10px] font-black text-indigo-500/80 shrink-0 select-none">
            {symbol === '■' ? '■' : '•'}
          </span>
          <input
            type="text"
            list="weekly-meeting-jobs-list"
            value={item}
            onChange={(e) => onChange(idx, e.target.value)}
            className="print-input flex-1 px-2 py-1 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-250/30 dark:border-zinc-800 rounded-lg text-xs font-semibold focus:border-indigo-500 outline-none text-zinc-850 dark:text-white"
            placeholder="..."
          />
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="print-action-btn opacity-0 group-hover/line:opacity-100 p-1 text-zinc-400 hover:text-rose-500 transition-opacity rounded shrink-0"
            title="Delete line"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="print-action-btn flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-600 transition pl-5 pt-1"
      >
        <Plus className="w-3 h-3" /> Add Line
      </button>
    </div>
  );
}

// ----------------------------------------------------
// INTERACTIVE MEETING BOARD VIEW
// ----------------------------------------------------
interface InteractiveBoardViewProps {
  tenantId: string;
  jobs: any[];
  tasks: any[];
  vehicles: any[];
  zones: any[];
  parts: any[];
  staff: any[];
  onSaveJobAlignment: (jobId: string, data: any) => Promise<void>;
  isSavingJobAlignment: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  blockerFilter: 'all' | 'blocked' | 'ready' | 'parts';
  setBlockerFilter: (f: 'all' | 'blocked' | 'ready' | 'parts') => void;
  selectedBoardJobId: string | null;
  setSelectedBoardJobId: (id: string | null) => void;
}

function InteractiveBoardView({
  tenantId,
  jobs,
  tasks,
  vehicles,
  zones,
  parts,
  staff,
  onSaveJobAlignment,
  isSavingJobAlignment,
  searchQuery,
  setSearchQuery,
  blockerFilter,
  setBlockerFilter,
  selectedBoardJobId,
  setSelectedBoardJobId
}: InteractiveBoardViewProps) {
  const activeJobsList = useMemo(() => {
    return jobs.filter((j: any) => !['Completed', 'Closed'].includes(j.status));
  }, [jobs]);

  const stats = useMemo(() => {
    const total = activeJobsList.length;
    const blocked = activeJobsList.filter((j: any) => j.status === 'Blocked' || j.isMissingParts || j.isScopeUnclear).length;
    const missingParts = activeJobsList.filter((j: any) => j.isMissingParts).length;
    const unclearScope = activeJobsList.filter((j: any) => j.isScopeUnclear).length;
    const ready = activeJobsList.filter((j: any) => j.isReadyForShop).length;
    return { total, blocked, missingParts, unclearScope, ready };
  }, [activeJobsList]);

  const filteredBoardJobs = useMemo(() => {
    return activeJobsList.filter((job: any) => {
      const search = searchQuery.toLowerCase().trim();
      const jobNum = String(job.jobNumber || '').toLowerCase();
      const title = String(job.title || '').toLowerCase();
      const desc = String(job.description || '').toLowerCase();
      
      const vehicle = vehicles.find((v: any) => v.vin === job.vehicleId || v.id === job.vehicleId);
      const vehicleStr = vehicle 
        ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.vin || ''}`.toLowerCase()
        : '';

      const matchesSearch = !search || 
        jobNum.includes(search) || 
        title.includes(search) || 
        desc.includes(search) ||
        vehicleStr.includes(search);

      if (!matchesSearch) return false;

      if (blockerFilter === 'blocked') {
        return job.status === 'Blocked' || job.isMissingParts || job.isScopeUnclear;
      }
      if (blockerFilter === 'ready') {
        return !!job.isReadyForShop;
      }
      if (blockerFilter === 'parts') {
        return !!job.isMissingParts;
      }
      return true;
    });
  }, [activeJobsList, searchQuery, blockerFilter, vehicles]);

  const selectedJob = useMemo(() => {
    return jobs.find((j: any) => j.id === selectedBoardJobId) || null;
  }, [jobs, selectedBoardJobId]);

  return (
    <div className="flex flex-col gap-6 w-full h-full select-text">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Active Jobs</p>
            <p className="text-2xl font-black text-zinc-800 dark:text-white mt-1">{stats.total}</p>
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Blocked Jobs</p>
            <p className="text-2xl font-black text-rose-500 mt-1">{stats.blocked}</p>
          </div>
          <div className="p-2 bg-rose-500/10 text-rose-500 rounded-xl">
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Missing Parts</p>
            <p className="text-2xl font-black text-amber-500 mt-1">{stats.missingParts}</p>
          </div>
          <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Scope Unclear</p>
            <p className="text-2xl font-black text-yellow-500 mt-1">{stats.unclearScope}</p>
          </div>
          <div className="p-2 bg-yellow-500/10 text-yellow-500 rounded-xl">
            <HelpCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex items-center justify-between col-span-2 md:col-span-1">
          <div>
            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Ready for Shop</p>
            <p className="text-2xl font-black text-emerald-500 mt-1">{stats.ready}</p>
          </div>
          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Board Split */}
      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-280px)] min-h-[500px]">
        {/* Left Column: Explorer */}
        <div className="w-full lg:w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 flex flex-col gap-4 shrink-0 h-full overflow-hidden">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search job #, title, vehicle..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 dark:text-white"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-650">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter subtabs */}
          <div className="flex flex-wrap gap-1 p-0.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
            {(['all', 'blocked', 'parts', 'ready'] as const).map(tab => {
              const count = tab === 'all' ? stats.total 
                          : tab === 'blocked' ? stats.blocked
                          : tab === 'parts' ? stats.missingParts
                          : stats.ready;
              return (
                <button
                  key={tab}
                  onClick={() => setBlockerFilter(tab)}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition text-center",
                    blockerFilter === tab
                      ? tab === 'blocked' ? "bg-rose-500 text-white shadow-sm font-extrabold"
                        : tab === 'parts' ? "bg-amber-500 text-white shadow-sm font-extrabold"
                        : tab === 'ready' ? "bg-emerald-500 text-white shadow-sm font-extrabold"
                        : "bg-zinc-900 dark:bg-zinc-800 text-white shadow-sm font-extrabold"
                      : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-bold"
                  )}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>

          {/* Jobs List */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
            {filteredBoardJobs.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 italic">No matching jobs found.</div>
            ) : (
              filteredBoardJobs.map((job: any) => {
                const isSelected = selectedBoardJobId === job.id;
                const vehicle = vehicles.find((v: any) => v.vin === job.vehicleId || v.id === job.vehicleId);
                const vehicleLabel = vehicle 
                  ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() 
                  : job.vehicleId || '';

                // Calculate tasks progress
                const jobTasks = tasks.filter(t => t.jobId === job.id && t.title !== 'General');
                const totalTasks = jobTasks.length;
                const completedTasks = jobTasks.filter(t => ['QC', 'QC Complete', 'completed'].includes(t.status)).length;
                const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedBoardJobId(job.id)}
                    className={cn(
                      "p-3.5 rounded-2xl border transition duration-200 cursor-pointer flex flex-col gap-2 relative",
                      isSelected 
                        ? "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 text-indigo-900 dark:text-indigo-300"
                        : "bg-white dark:bg-zinc-900 border-zinc-150 dark:border-zinc-850 hover:bg-zinc-50 dark:hover:bg-zinc-850/50 text-zinc-800 dark:text-zinc-200"
                    )}
                  >
                    {/* Top Row: Job # & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-black tracking-wider text-zinc-450 dark:text-zinc-550">#{job.jobNumber || 'WO'}</span>
                      <span className={cn(
                        "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider",
                        job.status === 'Blocked' ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                          : job.status === 'Ready for Customer' ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                          : job.status === 'QC' || job.status === 'Ready for QC' ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-655 dark:text-zinc-400"
                      )}>
                        {job.status || 'Open'}
                      </span>
                    </div>

                    {/* Title */}
                    <p className="text-xs font-extrabold truncate leading-tight mt-0.5">{job.title}</p>

                    {/* Vehicle */}
                    {vehicleLabel && (
                      <p className="text-[10px] font-bold text-zinc-450 dark:text-zinc-550 flex items-center gap-1.5 leading-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                        {vehicleLabel}
                      </p>
                    )}

                    {/* Progress Bar */}
                    {totalTasks > 0 && (
                      <div className="space-y-1 mt-1">
                        <div className="flex items-center justify-between text-[9px] font-black text-zinc-400 dark:text-zinc-555">
                          <span>Progress</span>
                          <span>{completedTasks}/{totalTasks} Tasks ({progressPct}%)</span>
                        </div>
                        <div className="w-full bg-zinc-100 dark:bg-zinc-950 rounded-full h-1.5 overflow-hidden border border-zinc-200/10">
                          <div 
                            className="bg-indigo-650 dark:bg-indigo-500 h-full rounded-full transition-all duration-350"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Blocker Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {job.isMissingParts && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-md uppercase tracking-widest flex items-center gap-1">
                          <Package className="w-2.5 h-2.5 animate-pulse" /> Missing Parts
                        </span>
                      )}
                      {job.isScopeUnclear && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-md uppercase tracking-widest flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 animate-pulse" /> Scope Unclear
                        </span>
                      )}
                      {job.isReadyForShop && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md uppercase tracking-widest flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Ready for Shop
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Workspace */}
        <div className="flex-1 min-w-0 h-full">
          {selectedJob ? (
            <JobAlignmentWorkspace
              key={selectedJob.id}
              job={selectedJob}
              tasks={tasks}
              vehicles={vehicles}
              zones={zones}
              parts={parts}
              staff={staff}
              tenantId={tenantId}
              onSave={onSaveJobAlignment}
              isSaving={isSavingJobAlignment}
            />
          ) : (
            <div className="h-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <ClipboardList className="w-16 h-16 text-indigo-500/20 dark:text-indigo-500/10 mb-4 animate-pulse" />
              <h3 className="font-extrabold text-zinc-800 dark:text-white text-base">Alignment Workspace</h3>
              <p className="text-zinc-500 text-xs mt-2 max-w-sm">
                Select an upfitting job from the left-hand panel to review its description scope, check missing parts, inspect task progress, and log meeting notes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// JOB ALIGNMENT WORKSPACE
// ----------------------------------------------------
interface JobAlignmentWorkspaceProps {
  job: any;
  tasks: any[];
  vehicles: any[];
  zones: any[];
  parts: any[];
  staff: any[];
  tenantId: string;
  onSave: (jobId: string, data: any) => Promise<void>;
  isSaving: boolean;
}

function JobAlignmentWorkspace({ job, tasks, vehicles, zones, parts, staff, tenantId, onSave, isSaving }: JobAlignmentWorkspaceProps) {
  const [weeklyNotes, setWeeklyNotes] = useState('');
  const [isMissingParts, setIsMissingParts] = useState(false);
  const [isScopeUnclear, setIsScopeUnclear] = useState(false);
  const [isReadyForShop, setIsReadyForShop] = useState(false);
  const [status, setStatus] = useState('');

  // Sync state when selected job changes
  useEffect(() => {
    if (!job) return;
    setWeeklyNotes(job.weeklyMeetingNotes || '');
    setIsMissingParts(!!job.isMissingParts);
    setIsScopeUnclear(!!job.isScopeUnclear);
    setIsReadyForShop(!!job.isReadyForShop);
    setStatus(job.status || 'Open');
  }, [job]);

  const hasUnsavedChanges = 
    weeklyNotes !== (job.weeklyMeetingNotes || '') ||
    isMissingParts !== (!!job.isMissingParts) ||
    isScopeUnclear !== (!!job.isScopeUnclear) ||
    isReadyForShop !== (!!job.isReadyForShop) ||
    status !== (job.status || 'Open');

  // Filter tasks & parts
  const jobTasks = useMemo(() => {
    return tasks.filter(t => t.jobId === job.id && t.title !== 'General');
  }, [tasks, job.id]);

  const jobParts = useMemo(() => {
    return parts.filter(p => p.jobId === job.id && !p.isArchived);
  }, [parts, job.id]);

  const vehicle = useMemo(() => {
    return vehicles.find(v => v.vin === job.vehicleId || v.id === job.vehicleId);
  }, [vehicles, job.vehicleId]);

  const zoneInfo = useMemo(() => {
    const zone = zones.find(z => 
      z.currentJobId === job.id || 
      (job.vehicleId && z.currentVehicleVin === job.vehicleId) ||
      (job.bayId && (job.bayId === z.id || job.bayId === z.name))
    );
    if (!zone) return '';
    const isBay = zone.type === 'bay';
    return `${isBay ? 'Bay' : 'Parking Spot'}: ${zone.name}`;
  }, [zones, job.id, job.vehicleId, job.bayId]);

  const handleSave = () => {
    onSave(job.id, {
      weeklyMeetingNotes: weeklyNotes,
      isMissingParts,
      isScopeUnclear,
      isReadyForShop,
      status
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 flex flex-col gap-6 h-full overflow-y-auto no-scrollbar select-text shadow-sm">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-150 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-black px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-md">
              #{job.jobNumber || 'WO'}
            </span>
            <a 
              href={`/business/${tenantId}/jobs/${job.id}`} 
              target="_blank" 
              rel="noreferrer" 
              className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1 hover:underline transition"
              title="Open job in a new tab"
            >
              Open Job Detail <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-white mt-1.5">{job.title}</h2>
          {(vehicle || zoneInfo) && (
            <p className="text-xs font-bold text-zinc-455 dark:text-zinc-500 mt-1 flex flex-wrap items-center gap-2">
              {vehicle && <span>Vehicle: {vehicle.year || ''} {vehicle.make || ''} {vehicle.model || ''} {vehicle.vin ? `(VIN: ${vehicle.vin})` : ''}</span>}
              {zoneInfo && (
                <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-md font-extrabold text-[10px] tracking-wider uppercase">
                  {zoneInfo}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Status drop down */}
        <div className="flex flex-col gap-1 shrink-0">
          <label className="text-[9px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest">Workflow Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 dark:text-white cursor-pointer transition"
          >
            <option value="Open">Open</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Active">Active</option>
            <option value="In Progress">In Progress</option>
            <option value="Blocked">Blocked</option>
            <option value="Ready for QC">Ready for QC</option>
            <option value="QC">QC</option>
            <option value="QC Complete">QC Complete</option>
            <option value="Ready for Customer">Ready for Customer</option>
            <option value="Completed">Completed</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Scope / Description */}
      <div>
        <h3 className="text-xs font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-indigo-500" /> Work Order Scope / Description
        </h3>
        <div className="bg-zinc-50 dark:bg-zinc-955 border border-zinc-200/50 dark:border-zinc-800/40 p-4 rounded-2xl max-h-32 overflow-y-auto no-scrollbar text-xs font-semibold text-zinc-700 dark:text-zinc-350 leading-relaxed whitespace-pre-wrap">
          {job.description || "No description / scope provided on the work order."}
        </div>
      </div>

      {/* Two columns: Tasks and Parts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tasks List */}
        <div className="flex flex-col">
          <h3 className="text-xs font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /> Scope Breakdown (Tasks)
          </h3>
          <div className="bg-zinc-50 dark:bg-zinc-955 border border-zinc-200/50 dark:border-zinc-800/40 rounded-2xl p-4 flex-1 max-h-48 overflow-y-auto no-scrollbar space-y-2">
            {jobTasks.length === 0 ? (
              <div className="text-center text-zinc-400 italic text-[11px] py-4">No tasks added to this job yet.</div>
            ) : (
              jobTasks.map((t: any) => {
                const tech = staff.find(s => s.id === t.assignedTo || s.userId === t.assignedTo);
                const techName = tech ? `${tech.firstName} ${tech.lastName}` : 'Unassigned';

                return (
                  <div key={t.id} className="bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-850 p-2.5 rounded-xl flex items-center justify-between gap-3 text-xs shadow-sm">
                    <div className="min-w-0">
                      <p className="font-extrabold truncate text-zinc-850 dark:text-zinc-100">{t.title}</p>
                      <p className="text-[10px] font-bold text-zinc-400 mt-0.5">{techName}</p>
                    </div>
                    <span className={cn(
                      "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider shrink-0",
                      t.status === 'completed' || t.status === 'QC Complete' ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                        : t.status === 'Blocked' ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                        : t.status === 'In Progress' ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                    )}>
                      {t.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Parts Requests */}
        <div className="flex flex-col">
          <h3 className="text-xs font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-indigo-500" /> Parts Requests
          </h3>
          <div className="bg-zinc-50 dark:bg-zinc-955 border border-zinc-200/50 dark:border-zinc-800/40 rounded-2xl p-4 flex-1 max-h-48 overflow-y-auto no-scrollbar space-y-2">
            {jobParts.length === 0 ? (
              <div className="text-center text-zinc-400 italic text-[11px] py-4">No parts requested for this job.</div>
            ) : (
              jobParts.map((p: any) => (
                <div key={p.id} className="bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-850 p-2.5 rounded-xl flex items-center justify-between gap-3 text-xs shadow-sm">
                  <div className="min-w-0">
                    <p className="font-extrabold text-zinc-850 dark:text-zinc-100 leading-tight">
                      {p.quantity || 1}x {p.partName}
                    </p>
                    {p.notes && <p className="text-[10px] font-medium text-zinc-450 truncate mt-0.5">{p.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.urgency === 'urgent' && (
                      <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded border border-rose-500/20 uppercase tracking-widest animate-pulse">
                        Urgent
                      </span>
                    )}
                    <span className={cn(
                      "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider",
                      p.status === 'received' || p.status === 'fulfilled' ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                        : p.status === 'ordered' ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                        : "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                    )}>
                      {p.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Alignment Section */}
      <div className="border-t border-zinc-150 dark:border-zinc-800 pt-5 space-y-4">
        <h3 className="text-xs font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-indigo-500" /> Weekly Meeting Alignment Check
        </h3>

        {/* Checkbox block */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Missing Parts Checkbox */}
          <div 
            onClick={() => setIsMissingParts(!isMissingParts)}
            className={cn(
              "p-3 rounded-2xl border transition duration-200 cursor-pointer flex items-center gap-3 select-none",
              isMissingParts 
                ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-450 font-extrabold shadow-sm" 
                : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            )}
          >
            {isMissingParts ? (
              <CheckSquare className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-zinc-450 shrink-0" />
            )}
            <div className="text-left">
              <p className="text-xs leading-none">Missing Parts</p>
              <p className="text-[9px] text-zinc-400 mt-0.5">Can't finish work due to parts</p>
            </div>
          </div>

          {/* Scope Unclear */}
          <div 
            onClick={() => setIsScopeUnclear(!isScopeUnclear)}
            className={cn(
              "p-3 rounded-2xl border transition duration-200 cursor-pointer flex items-center gap-3 select-none",
              isScopeUnclear 
                ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-455 font-extrabold shadow-sm" 
                : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            )}
          >
            {isScopeUnclear ? (
              <CheckSquare className="w-4 h-4 text-rose-500 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-zinc-455 shrink-0" />
            )}
            <div className="text-left">
              <p className="text-xs leading-none">Scope Unclear</p>
              <p className="text-[9px] text-zinc-400 mt-0.5">Work order lacks clear scope</p>
            </div>
          </div>

          {/* Ready for Shop */}
          <div 
            onClick={() => setIsReadyForShop(!isReadyForShop)}
            className={cn(
              "p-3 rounded-2xl border transition duration-200 cursor-pointer flex items-center gap-3 select-none",
              isReadyForShop 
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-450 font-extrabold shadow-sm" 
                : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            )}
          >
            {isReadyForShop ? (
              <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-zinc-450 shrink-0" />
            )}
            <div className="text-left">
              <p className="text-xs leading-none">Ready for Shop</p>
              <p className="text-[9px] text-zinc-400 mt-0.5">Approved to assign to crew</p>
            </div>
          </div>
        </div>

        {/* Alignment Notes Textarea */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-indigo-500" /> Meeting Notes & Action Items (This Job)
          </label>
          <textarea
            value={weeklyNotes}
            onChange={e => setWeeklyNotes(e.target.value)}
            placeholder="Type foreman & sales alignment notes here (e.g. Parts ETA, missing client info, scheduling blockers)..."
            className="w-full min-h-[90px] p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:border-indigo-500 font-semibold text-xs dark:text-white leading-relaxed resize-y placeholder:italic"
          />
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between gap-4 pt-2">
          {hasUnsavedChanges ? (
            <span className="text-[11px] font-extrabold text-amber-500 animate-pulse flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Unsaved changes in meeting review
            </span>
          ) : (
            <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Job alignment synchronized
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-indigo-650 hover:bg-indigo-700 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-450 rounded-xl text-xs font-black transition shadow-md active:scale-95 disabled:scale-100 disabled:shadow-none shrink-0"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Job Alignment
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// JOBS IN BAY VIEW
// --------------------------------------// ----------------------------------------------------
// JOBS IN BAY VIEW
// ----------------------------------------------------
const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate();
    } catch (e) {}
  }
  if (val && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const projectWorkingHours = (startDate: Date, totalHours: number, schedule?: any) => {
  if (totalHours <= 0) return startDate;
  
  const days = schedule?.days || [1, 2, 3, 4, 5];
  const startStr = schedule?.startTime || "08:00";
  const endStr = schedule?.endTime || "17:00";
  
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  
  const dailyWorkMs = ((endH * 60 + endM) - (startH * 60 + startM)) * 60000;
  if (dailyWorkMs <= 0 || days.length === 0) return startDate;
  
  let current = new Date(startDate);
  let remainingMs = totalHours * 3600000;
  
  while (remainingMs > 0) {
    const dayOfWeek = current.getDay();
    const mappedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    
    if (!days.includes(mappedDay)) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }
    
    const startOfShift = new Date(current);
    startOfShift.setHours(startH, startM, 0, 0);
    
    const endOfShift = new Date(current);
    endOfShift.setHours(endH, endM, 0, 0);
    
    if (current >= endOfShift) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }
    
    if (current < startOfShift) {
      current = new Date(startOfShift);
    }
    
    const msLeftInShift = endOfShift.getTime() - current.getTime();
    
    if (remainingMs <= msLeftInShift) {
      current = new Date(current.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= msLeftInShift;
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
    }
  }
  
  return current;
};

const calculateJobCalculatedFinish = (job: any, jobTasks: any[], departments: any[]) => {
  if (!jobTasks || jobTasks.length === 0) {
    return { calculatedDate: parseSafeDate(job?.expectedFinishTime), totalRemainingHours: 0, incompleteCount: 0, isAllCompleted: false };
  }

  const nonGeneralTasks = jobTasks.filter(t => t && t.title !== 'General');
  const incompleteTasks = nonGeneralTasks.filter(t => t && !['QC Complete', 'QC', 'completed'].includes(t.status));

  if (incompleteTasks.length === 0) {
    return { calculatedDate: null, totalRemainingHours: 0, incompleteCount: 0, isAllCompleted: true };
  }

  // Sum remaining book time
  const deptHours: Record<string, number> = {};
  let totalRemainingHours = 0;

  incompleteTasks.forEach(t => {
    const rawHours = parseFloat(t.bookTime || t.estimatedHours || t.duration || t.hours || '0') || 0;
    const deptId = t.departmentId || 'unassigned';
    deptHours[deptId] = (deptHours[deptId] || 0) + rawHours;
    totalRemainingHours += rawHours;
  });

  const nowTime = new Date();
  let maxETA = nowTime;

  if (totalRemainingHours > 0) {
    Object.entries(deptHours).forEach(([deptId, hours]) => {
      const dept = departments.find(d => d.id === deptId);
      const schedule = dept?.defaultSchedule;
      const eta = projectWorkingHours(nowTime, hours, schedule);
      if (eta > maxETA) {
        maxETA = eta;
      }
    });
  } else {
    // Fallback: 1 hour per incomplete task
    const fallbackHours = incompleteTasks.length * 1.0;
    maxETA = projectWorkingHours(nowTime, fallbackHours);
    totalRemainingHours = fallbackHours;
  }

  return {
    calculatedDate: maxETA,
    totalRemainingHours,
    incompleteCount: incompleteTasks.length,
    isAllCompleted: false
  };
};

interface BayJobsViewProps {
  tenantId: string;
  jobs: any[];
  tasks: any[];
  vehicles: any[];
  zones: any[];
  departments: any[];
  staff: any[];
  sessions?: any[];
  onSaveJobAlignment: (jobId: string, data: any) => Promise<void>;
  isSavingJobAlignment: boolean;
  isFullscreen?: boolean;
}

function BayJobsView({
  tenantId,
  jobs,
  tasks,
  vehicles,
  zones,
  departments,
  staff,
  sessions = [],
  onSaveJobAlignment,
  isSavingJobAlignment,
  isFullscreen = false
}: BayJobsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'in_progress' | 'has_notes'>('all');

  // Ensure Bays 1 through 10 exist and sort numerically (Bay 1 to Bay 10)
  const bayZones = useMemo(() => {
    const existingBayZones = zones.filter((z: any) => !z.isArchived && z.type === 'bay');

    // Create 1-10 default bays
    const defaultBays = Array.from({ length: 10 }, (_, i) => {
      const num = i + 1;
      const name = `Bay ${num}`;
      const existing = existingBayZones.find((z: any) => {
        const zName = String(z.name || '').toLowerCase().trim();
        return zName === name.toLowerCase() || zName === `bay ${num}` || zName === `${num}`;
      });

      if (existing) return existing;

      return {
        id: `bay-${num}`,
        name: `Bay ${num}`,
        type: 'bay',
        isDefault: true
      };
    });

    // Add any extra bay zones from Firestore not in 1-10
    const extraBays = existingBayZones.filter((z: any) => {
      const zName = String(z.name || '').toLowerCase().trim();
      return !defaultBays.some(b => String(b.name || '').toLowerCase().trim() === zName);
    });

    const allBays = [...defaultBays, ...extraBays];

    // Natural numerical sort: Bay 1, Bay 2, ..., Bay 9, Bay 10
    return allBays.sort((a: any, b: any) => {
      const nameA = String(a.name || '');
      const nameB = String(b.name || '');
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [zones]);

  // Map jobs in bays
  const bayJobsData = useMemo(() => {
    const activeJobs = jobs.filter((j: any) => !['Completed', 'Closed'].includes(j.status));

    const items: Array<{ id: string; zone: any; job: any | null }> = [];
    const matchedJobIds = new Set<string>();

    bayZones.forEach((z: any) => {
      const zNameLower = String(z.name || '').toLowerCase().trim();
      const bayNumMatch = zNameLower.match(/\d+/);
      const bayNumStr = bayNumMatch ? bayNumMatch[0] : null;

      const job = activeJobs.find((j: any) => {
        if (matchedJobIds.has(j.id)) return false;

        // Direct zone currentJobId
        if (z.currentJobId === j.id) return true;

        // Direct zone currentVehicleVin
        if (j.vehicleId && z.currentVehicleVin && z.currentVehicleVin === j.vehicleId) return true;

        // Match by job.bayId
        if (j.bayId) {
          const jBayLower = String(j.bayId).toLowerCase().trim();
          if (jBayLower === z.id.toLowerCase() || jBayLower === zNameLower) return true;
          if (bayNumStr && (jBayLower === bayNumStr || jBayLower === `bay ${bayNumStr}` || jBayLower === `bay-${bayNumStr}`)) return true;
        }

        return false;
      });

      if (job) {
        matchedJobIds.add(job.id);
      }

      items.push({
        id: z.id,
        zone: z,
        job: job || null
      });
    });

    // Also include any active jobs that have an unmapped bayId assigned (excluding parking/lot spots)
    activeJobs.forEach((j: any) => {
      if (matchedJobIds.has(j.id)) return;

      if (j.bayId && j.bayId !== 'none') {
        const jBayLower = String(j.bayId).toLowerCase().trim();
        const isNonBay = jBayLower.includes('park') || jBayLower.includes('lot') || jBayLower.includes('spot') || jBayLower.includes('staging') || jBayLower.includes('offsite');
        if (!isNonBay && (jBayLower.includes('bay') || /^\d+$/.test(jBayLower))) {
          const syntheticZone = {
            id: `synthetic-${j.id}`,
            name: typeof j.bayId === 'string' ? (j.bayId.toLowerCase().includes('bay') ? j.bayId : `Bay ${j.bayId}`) : 'Bay',
            type: 'bay'
          };
          items.push({
            id: `synthetic-${j.id}`,
            zone: syntheticZone,
            job: j
          });
        }
      }
    });

    return items;
  }, [bayZones, jobs]);

  // Stats calculation
  const stats = useMemo(() => {
    const totalBays = bayZones.length;
    const occupied = bayJobsData.filter(item => !!item.job).length;
    let totalRemainingBookTime = 0;

    const activeClockIns = (sessions || []).filter((s: any) => !s.clockOutTime && s.status !== 'clocked_out');
    
    // Count active tasks or active clock-in sessions on bay jobs
    let activeTasksCount = 0;
    const activeJobIds = new Set<string>();
    
    activeClockIns.forEach((s: any) => {
      if (s.jobId) activeJobIds.add(s.jobId);
    });

    bayJobsData.forEach(item => {
      if (!item.job) return;
      const jobTasks = tasks.filter(t => t.jobId === item.job.id && t.title !== 'General');
      
      const inProg = jobTasks.filter(t => ['In Progress', 'in_progress', 'active', 'working', 'clocked_in'].includes(t.status));
      const clockInsForJob = activeClockIns.filter((s: any) => s.jobId === item.job.id);
      
      const jobActiveCount = Math.max(inProg.length, clockInsForJob.length);
      if (jobActiveCount > 0) {
        activeTasksCount += jobActiveCount;
        activeJobIds.add(item.job.id);
      }

      const incompleteTasks = jobTasks.filter(t => !['QC', 'QC Complete', 'completed'].includes(t.status));
      incompleteTasks.forEach(t => {
        totalRemainingBookTime += parseFloat(t.bookTime || t.estimatedHours || t.duration || t.hours || '0') || 0;
      });
    });

    const finalActiveTasksCount = Math.max(activeTasksCount, activeClockIns.length, activeJobIds.size);

    return { totalBays, occupied, activeTasksCount: finalActiveTasksCount, totalRemainingBookTime };
  }, [bayZones, bayJobsData, tasks, sessions]);

  // Filter items: ONLY show occupied bays with a job (no empty bays)
  const filteredItems = useMemo(() => {
    return bayJobsData.filter(item => {
      // Exclude empty bays
      if (!item.job) return false;

      const job = item.job;
      const zoneName = item.zone?.name || '';
      
      const activeClockIns = (sessions || []).filter((s: any) => !s.clockOutTime && s.status !== 'clocked_out');
      const jobTasks = tasks.filter(t => t.jobId === job.id && t.title !== 'General');
      const hasInProgress = jobTasks.some(t => ['In Progress', 'in_progress', 'active', 'working', 'clocked_in'].includes(t.status)) || activeClockIns.some((s: any) => s.jobId === job.id);
      const hasNotes = !!job.weeklyMeetingNotes && job.weeklyMeetingNotes.trim().length > 0;

      if (filterMode === 'in_progress' && !hasInProgress) return false;
      if (filterMode === 'has_notes' && !hasNotes) return false;

      // Search query check
      if (!searchQuery) return true;
      const search = searchQuery.toLowerCase().trim();
      const jobNum = String(job?.jobNumber || '').toLowerCase();
      const jobTitle = String(job?.title || '').toLowerCase();
      const zName = String(zoneName).toLowerCase();
      const vehicle = job ? vehicles.find((v: any) => v.vin === job.vehicleId || v.id === job.vehicleId) : null;
      const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.vin || ''}`.toLowerCase() : '';

      return jobNum.includes(search) || jobTitle.includes(search) || zName.includes(search) || vehicleStr.includes(search);
    });
  }, [bayJobsData, filterMode, searchQuery, tasks, vehicles, sessions]);

  return (
    <div className={cn(
      "flex flex-col gap-6 w-full h-full select-text",
      isFullscreen && "h-full flex-1 gap-2"
    )}>
      {/* Header Stat Cards */}
      {!isFullscreen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Jobs in Bay</p>
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{stats.occupied}</p>
            </div>
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Remaining Book Time</p>
              <p className="text-2xl font-black text-emerald-500 mt-1">{stats.totalRemainingBookTime.toFixed(1)} hrs</p>
            </div>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Controls / Filter Bar */}
      {!isFullscreen && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search bay name, job #, vehicle..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 dark:text-white"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 shrink-0">
            {(['all', 'in_progress', 'has_notes'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterMode(tab)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition uppercase tracking-wider text-[10px]",
                  filterMode === tab
                    ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                {tab === 'all' ? 'All Jobs in Bay' : tab === 'in_progress' ? 'In Progress' : 'Has Notes'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sideways Scrollable Kanban Board */}
      {filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center rounded-3xl">
          <Building2 className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="font-bold text-zinc-800 dark:text-white text-base">No Active Jobs in Bays</h3>
          <p className="text-zinc-500 text-xs mt-1">There are currently no active jobs in any production bay matching your search.</p>
        </div>
      ) : (
        <div className={cn(
          "flex-1 overflow-x-auto overflow-y-auto no-scrollbar pb-6",
          isFullscreen && "h-full pt-2 pb-2"
        )}>
          <div className="flex flex-row gap-6 min-w-max items-start h-full">
            {filteredItems.map(item => (
              <div key={item.id} className="w-[450px] shrink-0 snap-start">
                <BayJobCard
                  zone={item.zone}
                  job={item.job}
                  tasks={tasks}
                  vehicles={vehicles}
                  departments={departments}
                  staff={staff}
                  tenantId={tenantId}
                  onSaveJobAlignment={onSaveJobAlignment}
                  isSavingJobAlignment={isSavingJobAlignment}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface BayJobCardProps {
  zone: any;
  job: any;
  tasks: any[];
  vehicles: any[];
  departments: any[];
  staff: any[];
  tenantId: string;
  onSaveJobAlignment: (jobId: string, data: any) => Promise<void>;
  isSavingJobAlignment: boolean;
}

function BayJobCard({
  zone,
  job,
  tasks,
  vehicles,
  departments,
  staff,
  tenantId,
  onSaveJobAlignment,
  isSavingJobAlignment
}: BayJobCardProps) {
  // Helpers to format dates for inputs & displays
  const formatDatetimeLocalInput = (dateVal?: any) => {
    if (!dateVal) return '';
    try {
      const date = typeof dateVal.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
      if (isNaN(date.getTime())) return '';
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      return date.toISOString().slice(0, 16);
    } catch (e) {
      return '';
    }
  };

  const formatDisplayDate = (dateVal?: any) => {
    if (!dateVal) return 'Not Set';
    try {
      const date = typeof dateVal.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
      if (isNaN(date.getTime())) return 'Not Set';
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Not Set';
    }
  };

  const formatTaskTime = (ts?: any) => {
    if (!ts) return '';
    try {
      const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + date.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) + ')';
    } catch (e) {
      return '';
    }
  };

  // Tasks classification
  const jobTasks = useMemo(() => {
    if (!job) return [];
    return tasks.filter((t: any) => t.jobId === job.id && t.title !== 'General');
  }, [tasks, job]);

  // Dynamic ETA calculation based on schedule and uncompleted task book time
  const finishCalc = useMemo(() => {
    return calculateJobCalculatedFinish(job, jobTasks, departments);
  }, [job, jobTasks, departments]);

  // Notes and ETA local state
  const [notes, setNotes] = useState(job?.weeklyMeetingNotes || '');
  const effectiveDate = job?.expectedFinishTime || finishCalc.calculatedDate;
  const [expectedFinishInput, setExpectedFinishInput] = useState(formatDatetimeLocalInput(effectiveDate));
  const [isSavingLocal, setIsSavingLocal] = useState(false);

  // Sync state when job or finish calculation changes
  useEffect(() => {
    setNotes(job?.weeklyMeetingNotes || '');
    const dateToUse = job?.expectedFinishTime || finishCalc.calculatedDate;
    setExpectedFinishInput(formatDatetimeLocalInput(dateToUse));
  }, [job, finishCalc.calculatedDate]);

  const handleUseCalculatedFinish = () => {
    if (finishCalc.calculatedDate) {
      setExpectedFinishInput(formatDatetimeLocalInput(finishCalc.calculatedDate));
      toast.info("Recalculated finish date from remaining task book times & schedule!");
    }
  };

  const vehicle = useMemo(() => {
    if (!job) return null;
    return vehicles.find((v: any) => v.vin === job.vehicleId || v.id === job.vehicleId);
  }, [vehicles, job]);

  const vehicleLabel = vehicle 
    ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.vin ? `(VIN: ${vehicle.vin})` : ''}`.trim()
    : job?.vehicleId || '';

  // 1. Worked On (In Progress)
  const workedOnTasks = useMemo(() => {
    return jobTasks.filter((t: any) => t.status === 'In Progress' || t.status === 'in_progress' || t.status === 'active');
  }, [jobTasks]);

  // 2. Latest Worked On Task
  const latestWorkedOnTask = useMemo(() => {
    if (jobTasks.length === 0) return null;
    
    const getTaskTime = (t: any) => {
      const ts = t.lastWorkedOn || t.updatedAt || t.completedAt || t.startedAt || t.createdAt;
      if (!ts) return 0;
      if (typeof ts === 'number') return ts;
      if (ts.seconds) return ts.seconds * 1000;
      if (ts.toDate) return ts.toDate().getTime();
      return new Date(ts).getTime() || 0;
    };

    const sorted = [...jobTasks].sort((a, b) => getTaskTime(b) - getTaskTime(a));
    return sorted[0] || null;
  }, [jobTasks]);

  // 3. Completed Tasks
  const completedTasks = useMemo(() => {
    return jobTasks.filter((t: any) => ['QC', 'QC Complete', 'completed'].includes(t.status));
  }, [jobTasks]);

  // 4. To Do Tasks
  const todoTasks = useMemo(() => {
    return jobTasks.filter((t: any) => !['QC', 'QC Complete', 'completed', 'In Progress', 'in_progress', 'active'].includes(t.status));
  }, [jobTasks]);

  const hasUnsavedChanges = 
    notes !== (job?.weeklyMeetingNotes || '') ||
    expectedFinishInput !== formatDatetimeLocalInput(job?.expectedFinishTime);

  const handleSaveCard = async () => {
    if (!job || !tenantId) return;
    setIsSavingLocal(true);
    try {
      const finishIso = expectedFinishInput ? new Date(expectedFinishInput).toISOString() : null;
      await onSaveJobAlignment(job.id, {
        weeklyMeetingNotes: notes,
        expectedFinishTime: finishIso
      });
      toast.success(`Saved notes & finish date for #${job.jobNumber || 'WO'}`);
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setIsSavingLocal(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 flex flex-col gap-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition">
      
      {/* Card Header: Bay & Job Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-150 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-lg font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              {zone.name || 'Production Bay'}
            </span>
            <span className="text-xs font-black px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md">
              #{job.jobNumber || 'WO'}
            </span>
            <span className={cn(
              "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider",
              job.status === 'Blocked' ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                : job.status === 'Ready for Customer' ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                : job.status === 'QC' || job.status === 'Ready for QC' ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                : "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
            )}>
              {job.status || 'Open'}
            </span>
          </div>

          <h3 className="text-base font-black text-zinc-900 dark:text-white mt-2 flex items-center gap-2">
            {job.title}
            <a
              href={`/business/${tenantId}/jobs/${job.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-indigo-500 transition p-0.5"
              title="Open job details"
            >
              <ChevronRight className="w-4 h-4" />
            </a>
          </h3>

          {vehicleLabel && (
            <p className="text-xs font-bold text-zinc-450 dark:text-zinc-500 mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              {vehicleLabel}
            </p>
          )}
        </div>

        {/* Estimated Finish Date/Time Section */}
        <div className="flex flex-col gap-1.5 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 shrink-0 min-w-[250px]">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[9px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1">
              <CalendarDays className="w-3 h-3 text-indigo-500" /> Est. Finish Date & Time
            </label>
            {finishCalc.calculatedDate && (
              <button
                type="button"
                onClick={handleUseCalculatedFinish}
                className="text-[9px] font-black text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                title="Reset finish date to schedule calculation from incomplete task book time"
              >
                <Sparkles className="w-2.5 h-2.5" /> Recalculate
              </button>
            )}
          </div>

          <input
            type="datetime-local"
            value={expectedFinishInput}
            onChange={e => setExpectedFinishInput(e.target.value)}
            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 cursor-pointer"
          />

          {finishCalc.isAllCompleted ? (
            <p className="text-[9px] font-bold text-emerald-500 flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3" /> All tasks completed
            </p>
          ) : (
            <div className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 leading-tight space-y-0.5 mt-0.5">
              <p className="flex items-center justify-between gap-1">
                <span>Calculated ETA:</span>
                <span className="font-black text-indigo-600 dark:text-indigo-400">
                  {formatDisplayDate(finishCalc.calculatedDate)}
                </span>
              </p>
              <p className="text-[8.5px] text-zinc-400">
                ({finishCalc.totalRemainingHours.toFixed(1)}h remaining across {finishCalc.incompleteCount} incomplete {finishCalc.incompleteCount === 1 ? 'task' : 'tasks'})
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4 Task Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* 1. What task is worked on */}
        <div className="bg-zinc-50 dark:bg-zinc-955 p-3.5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" /> Task Worked On
            </h4>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-indigo-500/10 text-indigo-500 rounded-md">
              {workedOnTasks.length} Active
            </span>
          </div>

          {workedOnTasks.length === 0 ? (
            <p className="text-xs text-zinc-400 italic py-2">No task currently in progress.</p>
          ) : (
            <div className="space-y-1.5">
              {workedOnTasks.map((t: any) => {
                const tech = staff.find((s: any) => s.id === t.assignedTo || s.userId === t.assignedTo);
                const techName = tech ? `${tech.firstName} ${tech.lastName}` : 'Unassigned Tech';

                return (
                  <div key={t.id} className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-2 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xs">
                    <div className="min-w-0">
                      <p className="font-extrabold text-zinc-900 dark:text-white truncate">{t.title}</p>
                      <p className="text-[10px] font-bold text-zinc-450 flex items-center gap-1">
                        <User className="w-3 h-3 text-zinc-400" /> {techName}
                      </p>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-black rounded-md uppercase tracking-wider shrink-0 animate-pulse">
                      In Progress
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Latest Worked On */}
        <div className="bg-zinc-50 dark:bg-zinc-955 p-3.5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 flex flex-col gap-2">
          <h4 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Latest Worked On
          </h4>

          {!latestWorkedOnTask ? (
            <p className="text-xs text-zinc-400 italic py-2">No task updates recorded yet.</p>
          ) : (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-2.5 rounded-xl text-xs flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold text-zinc-900 dark:text-white truncate">{latestWorkedOnTask.title}</p>
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider shrink-0",
                  latestWorkedOnTask.status === 'completed' || latestWorkedOnTask.status === 'QC Complete' ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                    : latestWorkedOnTask.status === 'In Progress' || latestWorkedOnTask.status === 'in_progress' ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                )}>
                  {latestWorkedOnTask.status}
                </span>
              </div>
              
              <p className="text-[10px] font-bold text-zinc-400 flex items-center justify-between mt-1">
                <span>
                  Tech: {staff.find((s: any) => s.id === latestWorkedOnTask.assignedTo || s.userId === latestWorkedOnTask.assignedTo)?.firstName || 'Staff'}
                </span>
                {formatTaskTime(latestWorkedOnTask.lastWorkedOn || latestWorkedOnTask.updatedAt || latestWorkedOnTask.completedAt) && (
                  <span className="text-zinc-500 dark:text-zinc-400 font-extrabold">
                    {formatTaskTime(latestWorkedOnTask.lastWorkedOn || latestWorkedOnTask.updatedAt || latestWorkedOnTask.completedAt)}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* 3. Completed Tasks */}
        <div className="bg-zinc-50 dark:bg-zinc-955 p-3.5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Completed Tasks
            </h4>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md">
              {completedTasks.length} / {jobTasks.length} Done
            </span>
          </div>

          {completedTasks.length === 0 ? (
            <p className="text-xs text-zinc-400 italic py-2">No completed tasks yet.</p>
          ) : (
            <div className="max-h-28 overflow-y-auto no-scrollbar space-y-1">
              {completedTasks.map((t: any) => (
                <div key={t.id} className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 bg-white dark:bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">{t.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. To Do Tasks */}
        <div className="bg-zinc-50 dark:bg-zinc-955 p-3.5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <ListTodo className="w-3.5 h-3.5 text-zinc-400" /> To-Do Tasks
            </h4>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md">
              {todoTasks.length} Pending
            </span>
          </div>

          {todoTasks.length === 0 ? (
            <p className="text-xs text-zinc-400 italic py-2">All tasks completed or in progress!</p>
          ) : (
            <div className="max-h-28 overflow-y-auto no-scrollbar space-y-1">
              {todoTasks.map((t: any) => (
                <div key={t.id} className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5 bg-white dark:bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60">
                  <Square className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{t.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Notes & Actions for this Bay Job */}
      <div className="border-t border-zinc-150 dark:border-zinc-800 pt-4 flex flex-col gap-2">
        <label className="text-[10px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-500" /> Bay Meeting Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Type notes for this bay job during the meeting (parts status, roadblocks, crew instructions)..."
          className="w-full min-h-[75px] p-3 bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:border-indigo-500 font-semibold text-xs dark:text-white leading-relaxed resize-y placeholder:italic"
        />

        <div className="flex items-center justify-between pt-1">
          {hasUnsavedChanges ? (
            <span className="text-[10px] font-extrabold text-amber-500 flex items-center gap-1 animate-pulse">
              <AlertCircle className="w-3 h-3" /> Unsaved changes
            </span>
          ) : (
            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Synced to job file
            </span>
          )}

          <button
            onClick={handleSaveCard}
            disabled={isSavingLocal || isSavingJobAlignment || !hasUnsavedChanges}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-400 rounded-xl text-xs font-black transition shadow-sm active:scale-95 disabled:scale-100 shrink-0"
          >
            {isSavingLocal || isSavingJobAlignment ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Bay Notes & ETA
          </button>
        </div>
      </div>

    </div>
  );
}


