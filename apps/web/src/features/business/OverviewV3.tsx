import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';
import { db } from '../../lib/firebase/config';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  collectionGroup, getDoc, addDoc, serverTimestamp, getDocs 
} from 'firebase/firestore';
import { 
  Clock, Play, Square, Coffee, Pizza, 
  AlertCircle, MapPin, Wrench, Check, ChevronDown, ChevronUp,
  ExternalLink, CheckCircle, Search
} from 'lucide-react';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { useJobClock } from '../timeclock/useJobClock';
import { getCurrentLocation, updateStaffLastLocation, calculateDistance } from '../../lib/locationService';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { TimeAllocationModal } from './TimeAllocationModal';

export function OverviewV3({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { user, impersonatedStaff, permissions = {} } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid;
  const { activeSessionId, setStatus: setClockStatus, reset: resetClock } = useTimeclockStore();

  const isTaskCompleted = (status?: string) => {
    if (!status) return false;
    return ['completed', 'QC', 'QC Complete'].includes(status);
  };

  // States
  const [staffMember, setStaffMember] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [activeSessionData, setActiveSessionData] = useState<any>(null);
  const [isClockProcessing, setIsClockProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [activeTaskForCompletion, setActiveTaskForCompletion] = useState<any | null>(null);
  const [timeLogsForJob, setTimeLogsForJob] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [myTimeSessions, setMyTimeSessions] = useState<any[]>([]);
  const [jobTaskQueries, setJobTaskQueries] = useState<Record<string, string>>({});
  const [showStatsExpander, setShowStatsExpander] = useState(false);

  const effectiveUserUid = staffMember?.userId || (!impersonatedStaff ? user?.uid : '');

  const { clockIntoJob, clockOutOfJob } = useJobClock(
    tenantId,
    activeSessionData?.id,
    effectiveUserUid
  );

  // Derived clock status to support impersonation
  const clockStatus = useMemo(() => {
    if (!activeSessionData) return 'clocked_out';
    if (activeSessionData.status === 'on_break') {
      const activeBreak = activeSessionData.breaks?.find((b: any) => !b.end);
      if (activeBreak?.type === 'lunch') return 'on_lunch';
      return 'on_break';
    }
    return 'clocked_in';
  }, [activeSessionData]);

  // Real-time or one-time fetch of time logs when a task completion is pending
  useEffect(() => {
    if (!activeTaskForCompletion) {
      setTimeLogsForJob([]);
      return;
    }
    const jobId = activeTaskForCompletion.jobId;
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('jobIds', 'array-contains', jobId)
    );
    getDocs(q).then((snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      logs.sort((a: any, b: any) => {
        const getTs = (item: any) => {
          const val = item.clockIn?.timestamp;
          if (val?.seconds) return val.seconds * 1000;
          return new Date(val || 0).getTime();
        };
        return getTs(b) - getTs(a);
      });
      setTimeLogsForJob(logs);
    }).catch(err => {
      console.error("Error fetching time logs for completion modal:", err);
    });
  }, [activeTaskForCompletion, tenantId]);

  // Real-time listener for vehicles
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, [tenantId]);

  // Real-time listener for technician's time sessions
  useEffect(() => {
    if (!tenantId || !effectiveUserUid) return;
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('userId', '==', effectiveUserUid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMyTimeSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, [tenantId, effectiveUserUid]);

  // Sum up total hours spent on a specific task
  const getHoursForTask = (jobId: string, taskId: string) => {
    let totalMs = 0;
    myTimeSessions.forEach(session => {
      const taskSegments = (session.jobs || []).filter((j: any) => j.id === jobId && j.taskId === taskId);
      taskSegments.forEach((seg: any) => {
        const start = seg.start?.seconds 
          ? seg.start.seconds * 1000 
          : (seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime());
        
        let endMs = currentTime;
        if (seg.end) {
          endMs = seg.end.seconds 
            ? seg.end.seconds * 1000 
            : (seg.end?.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime());
        } else if (session.status === 'completed' || session.clockOut?.timestamp) {
          const clockOutVal = session.clockOut?.timestamp;
          if (clockOutVal) {
            endMs = clockOutVal.seconds 
              ? clockOutVal.seconds * 1000 
              : (clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime());
          } else {
            const updatedVal = session.updatedAt || session.createdAt;
            endMs = updatedVal?.seconds 
              ? updatedVal.seconds * 1000 
              : (updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime());
          }
        }
        totalMs += Math.max(0, endMs - start);
      });
    });
    return totalMs / 3600000;
  };

  // Keep time ticker active for clocked durations
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Staff member lookup (supports impersonation)
  useEffect(() => {
    if (!tenantId || !effectiveUserId) return;

    if (impersonatedStaff && impersonatedStaff.type === 'staff') {
      const docRef = doc(db, `businesses/${tenantId}/staff`, impersonatedStaff.id);
      const unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const sd = docSnap.data();
          setStaffMember({ 
            id: docSnap.id, 
            ...sd,
            name: `${sd.firstName || ''} ${sd.lastName || ''}`.trim()
          });
        } else {
          setStaffMember(null);
        }
      });
      return () => unsub();
    } else {
      const q = query(
        collection(db, `businesses/${tenantId}/staff`),
        where('userId', '==', effectiveUserId)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const sd = snap.docs[0].data();
          setStaffMember({ 
            id: snap.docs[0].id, 
            ...sd,
            name: `${sd.firstName || ''} ${sd.lastName || ''}`.trim()
          });
        } else {
          // Fallback to email lookup if userId not matched
          const emailQuery = query(
            collection(db, `businesses/${tenantId}/staff`),
            where('email', '==', user?.email?.toLowerCase() || '')
          );
          const unsubEmail = onSnapshot(emailQuery, (emailSnap) => {
            if (!emailSnap.empty) {
              const emailData = emailSnap.docs[0].data();
              setStaffMember({ 
                id: emailSnap.docs[0].id, 
                ...emailData,
                name: `${emailData.firstName || ''} ${emailData.lastName || ''}`.trim()
              });
            } else {
              setStaffMember(null);
            }
          });
          return () => unsubEmail();
        }
      });
      return () => unsub();
    }
  }, [tenantId, effectiveUserId, impersonatedStaff, user?.email]);

  // Real-time listener for zones
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, [tenantId]);

  // Real-time listener for jobs
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, [tenantId]);

  // Real-time listener for active time session (supports impersonation)
  useEffect(() => {
    if (!tenantId || !effectiveUserUid) {
      setActiveSessionData(null);
      return;
    }

    // Query for any active or on_break session for this effective user
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('userId', '==', effectiveUserUid),
      where('status', 'in', ['active', 'on_break'])
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        setActiveSessionData({ id: docSnap.id, ...docSnap.data() });
      } else {
        setActiveSessionData(null);
      }
    });
    return unsub;
  }, [tenantId, effectiveUserUid]);

  // Real-time listener for assigned tasks
  useEffect(() => {
    if (!tenantId || !effectiveUserId) return;
    const searchIds = [effectiveUserId];
    if (staffMember?.id) searchIds.push(staffMember.id);

    const q = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId),
      where('assignedStaffIds', 'array-contains-any', searchIds)
    );
    const unsub = onSnapshot(q, (snap) => {
      const filtered = snap.docs
        .filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`))
        .map(doc => ({
          id: doc.id,
          jobId: doc.ref.path.split('/')[3],
          ...doc.data()
        }));
      setMyTasks(filtered);
    });
    return unsub;
  }, [tenantId, effectiveUserId, staffMember?.id]);

  // Find all active job/task clocks currently active in session
  const activeClocks = useMemo(() => {
    if (!activeSessionData?.jobs) return [];
    return activeSessionData.jobs.filter((j: any) => !j.end).map((j: any) => {
      const fullJob = jobs.find(job => job.id === j.id);
      return {
        ...j,
        jobNumber: fullJob?.jobNumber || '',
        jobTitle: fullJob?.title || j.name || 'Job'
      };
    });
  }, [activeSessionData, jobs]);



  // Split jobs into active (incomplete tasks & open job status) and previous (completed tasks or closed/ready job status)
  const { jobsWithAssignedTasks, previousJobs } = useMemo(() => {
    const activeList: any[] = [];
    const previousList: any[] = [];

    // Helper to find when Patrick last worked on a job
    const getLatestWorkedOnTime = (job: any) => {
      let latestTime = 0;
      
      // 1. Check time sessions for segments on this job
      myTimeSessions.forEach(session => {
        const segments = session.jobs || [];
        segments.forEach((seg: any) => {
          if (seg.id === job.id) {
            const startTs = seg.start?.seconds 
              ? seg.start.seconds * 1000 
              : (seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start || 0).getTime());
            const endTs = seg.end?.seconds 
              ? seg.end.seconds * 1000 
              : (seg.end?.toDate ? seg.end.toDate().getTime() : new Date(seg.end || 0).getTime());
            
            const segmentTime = Math.max(startTs, endTs);
            if (segmentTime > latestTime) {
              latestTime = segmentTime;
            }
          }
        });
      });

      // 2. Check active clocks (currently working on it right now)
      activeClocks.forEach((ac: any) => {
        if (ac.id === job.id) {
          latestTime = Date.now();
        }
      });

      // 3. Fallback to job's updatedAt or createdAt
      if (latestTime === 0) {
        const jobDate = job.updatedAt || job.createdAt;
        if (jobDate) {
          latestTime = jobDate.seconds 
            ? jobDate.seconds * 1000 
            : (jobDate.toDate ? jobDate.toDate().getTime() : new Date(jobDate).getTime());
        }
      }

      return latestTime;
    };

    // Helper to find when Patrick latest completed a task on this job
    const getLatestCompletionTime = (job: any) => {
      const allAssignedTasks = myTasks.filter(task => task.jobId === job.id);
      const completionTimes = allAssignedTasks
        .map(t => t.completedAt ? new Date(t.completedAt).getTime() : 0)
        .filter(t => t > 0);
      
      if (completionTimes.length > 0) {
        return Math.max(...completionTimes);
      }
      
      const jobDate = job.readyForCustomerAt || job.updatedAt || job.createdAt;
      if (jobDate) {
        return jobDate.seconds 
          ? jobDate.seconds * 1000 
          : (jobDate.toDate ? jobDate.toDate().getTime() : new Date(jobDate).getTime());
      }
      return 0;
    };

    jobs.forEach(job => {
      const allAssignedTasks = myTasks.filter(task => task.jobId === job.id);
      if (allAssignedTasks.length === 0) return;

      const incompleteTasks = allAssignedTasks.filter(task => !isTaskCompleted(task.status));
      const isFinishedJob = ['Ready for Customer', 'Completed', 'Closed'].includes(job.status || '');

      if (incompleteTasks.length > 0 && !isFinishedJob) {
        // Job is active since it has incomplete tasks and the job itself is open/active.
        activeList.push({
          ...job,
          tasks: incompleteTasks
        });
      } else if (allAssignedTasks.length > 0) {
        // Either all tasks are completed, or the job is finished (Ready for Customer, Completed, Closed)
        previousList.push({
          ...job,
          tasks: allAssignedTasks
        });
      }
    });

    // Sort active jobs: ones you have latest worked on first
    activeList.sort((a, b) => getLatestWorkedOnTime(b) - getLatestWorkedOnTime(a));

    // Sort previous jobs: latest completed first
    previousList.sort((a, b) => getLatestCompletionTime(b) - getLatestCompletionTime(a));

    return {
      jobsWithAssignedTasks: activeList,
      previousJobs: previousList
    };
  }, [jobs, myTasks, myTimeSessions, activeClocks]);

  // Calculate category-level workload stats
  const totalActiveRemainingHours = useMemo(() => {
    let total = 0;
    jobsWithAssignedTasks.forEach(job => {
      job.tasks.forEach((task: any) => {
        if (!isTaskCompleted(task.status)) {
          const hours = getHoursForTask(job.id, task.id);
          const limit = parseFloat(task.bookTime) || 0;
          if (task.payBasis !== 'hourly' && limit > 0) {
            total += Math.max(0, limit - hours);
          }
        }
      });
    });
    return total;
  }, [jobsWithAssignedTasks, myTimeSessions]);

  const totalPreviousLoggedHours = useMemo(() => {
    let total = 0;
    previousJobs.forEach(job => {
      job.tasks.forEach((task: any) => {
        total += getHoursForTask(job.id, task.id);
      });
    });
    return total;
  }, [previousJobs, myTimeSessions]);

  // Format running duration timer
  const formatDuration = (start: any) => {
    if (!start) return '00:00:00';
    const startTime = start.seconds 
      ? start.seconds * 1000 
      : (start.toDate ? start.toDate().getTime() : new Date(start).getTime());
    const diffMs = currentTime - startTime;
    if (diffMs < 0) return '00:00:00';
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper to calculate daily session clocked hours
  const getSessionHours = (session: any, currentTs: number) => {
    if (!session?.clockIn?.timestamp) return 0;
    const inTime = session.clockIn.timestamp?.seconds 
      ? session.clockIn.timestamp.seconds * 1000 
      : new Date(session.clockIn.timestamp).getTime();
    
    let outTime = currentTs;
    if (session.clockOut?.timestamp) {
      outTime = session.clockOut.timestamp?.seconds 
        ? session.clockOut.timestamp.seconds * 1000 
        : new Date(session.clockOut.timestamp).getTime();
    } else if (session.status === 'completed') {
      const updatedVal = session.updatedAt || session.createdAt;
      outTime = updatedVal?.seconds 
        ? updatedVal.seconds * 1000 
        : new Date(updatedVal || inTime).getTime();
    }
    
    const elapsedMs = outTime - inTime;
    
    // Deduct unpaid breaks
    let breakMs = 0;
    if (session.breaks) {
      session.breaks.forEach((b: any) => {
        const start = b.start?.seconds ? b.start.seconds * 1000 : new Date(b.start).getTime();
        const end = b.end 
          ? (b.end?.seconds ? b.end.seconds * 1000 : new Date(b.end).getTime())
          : outTime;
        if (!b.isPaid) {
          breakMs += Math.max(0, end - start);
        }
      });
    }
    
    return Math.max(0, (elapsedMs - breakMs) / 3600000);
  };

  // Helper to resolve task completion time
  const getTaskCompletionTime = (completedAt: any) => {
    if (!completedAt) return 0;
    if (completedAt.seconds) return completedAt.seconds * 1000;
    if (completedAt.toDate) return completedAt.toDate().getTime();
    return new Date(completedAt).getTime();
  };

  // Calculate detailed performance stats (Today & This Week)
  const stats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekMs = startOfWeek.getTime();

    // 1. Clocked In Hours
    let clockedToday = 0;
    let clockedThisWeek = 0;

    myTimeSessions.forEach(session => {
      const hours = getSessionHours(session, currentTime);
      if (!session?.clockIn?.timestamp) return;
      const sessionStartMs = session.clockIn.timestamp.seconds 
        ? session.clockIn.timestamp.seconds * 1000 
        : new Date(session.clockIn.timestamp).getTime();
      
      if (sessionStartMs >= startOfTodayMs) {
        clockedToday += hours;
      }
      if (sessionStartMs >= startOfWeekMs) {
        clockedThisWeek += hours;
      }
    });

    // 2. Book Time Completed
    let bookToday = 0;
    let bookThisWeek = 0;

    myTasks.forEach((task: any) => {
      if (isTaskCompleted(task.status) && task.completedAt) {
        const completedMs = getTaskCompletionTime(task.completedAt);
        const bookTimeVal = parseFloat(task.bookTime) || 0;
        
        if (completedMs >= startOfTodayMs) {
          bookToday += bookTimeVal;
        }
        if (completedMs >= startOfWeekMs) {
          bookThisWeek += bookTimeVal;
        }
      }
    });

    // 3. Efficiency
    const efficiencyToday = clockedToday > 0 ? (bookToday / clockedToday) * 100 : 0;
    const efficiencyThisWeek = clockedThisWeek > 0 ? (bookThisWeek / clockedThisWeek) * 100 : 0;

    return {
      clockedToday,
      clockedThisWeek,
      bookToday,
      bookThisWeek,
      efficiencyToday,
      efficiencyThisWeek
    };
  }, [myTimeSessions, myTasks, currentTime]);



  // Clock In / Out handlers (Daily)
  const handleClockIn = async () => {
    setIsClockProcessing(true);
    try {
      let actualName = user?.displayName || user?.email || 'Technician';
      if (staffMember) {
        actualName = `${staffMember.firstName || ''} ${staffMember.lastName || ''}`.trim() || actualName;
      }

      const loc = await getCurrentLocation();
      let onSite = true;
      let isRemote = false;

      let settings: any = null;
      try {
        const settingsSnap = await getDoc(doc(db, 'businesses', tenantId));
        if (settingsSnap.exists()) settings = settingsSnap.data();
      } catch (err) {
        console.warn(err);
      }

      if (loc.lat !== null && loc.lng !== null) {
        if (settings?.siteLat && settings?.siteLng) {
          const dist = calculateDistance(
            loc.lat, loc.lng,
            parseFloat(settings.siteLat), parseFloat(settings.siteLng)
          );
          onSite = dist <= (settings.siteRadius || 500);
        }
        isRemote = !onSite;
      } else {
        isRemote = true;
        onSite = false;
      }

      if (isRemote && settings && !settings.allowOffsiteClockIn && !permissions['timeclock.offsite']) {
        toast.error("Clocking in off-site is not allowed for your account.");
        return;
      }

      // Check if there is already a time session from today for this user
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      
      const todaySession = myTimeSessions.find(session => {
        if (!session.clockIn?.timestamp) return false;
        const ts = session.clockIn.timestamp.seconds 
          ? session.clockIn.timestamp.seconds * 1000 
          : new Date(session.clockIn.timestamp).getTime();
        return ts >= startOfToday.getTime();
      });

      if (todaySession) {
        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, todaySession.id);
        const prevClockOut = todaySession.clockOut?.timestamp;
        
        const gapBreak = prevClockOut ? {
          start: prevClockOut,
          end: new Date(),
          isPaid: false,
          type: 'normal',
          name: 'Clock Out Gap'
        } : null;

        const updatedBreaks = [...(todaySession.breaks || [])];
        if (gapBreak) {
          updatedBreaks.push(gapBreak);
        }

        await updateDoc(sessionRef, {
          status: 'active',
          clockOut: null,
          breaks: updatedBreaks,
          updatedAt: serverTimestamp()
        });

        await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, "Clocked In");
        
        if (!impersonatedStaff) {
          setClockStatus('clocked_in', Date.now(), todaySession.id);
        }
        toast.success("Clocked back in for today's shift");
      } else {
        const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
          userId: effectiveUserId,
          userName: actualName,
          staffName: actualName,
          clockIn: {
            timestamp: new Date(),
            lat: loc.lat,
            lng: loc.lng,
            accuracy: loc.accuracy,
            onSite
          },
          isRemote,
          status: 'active',
          breaks: [],
          createdAt: new Date()
        });

        await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, "Clocked In");
        if (!impersonatedStaff) {
          setClockStatus('clocked_in', Date.now(), docRef.id);
        }
        toast.success("Clocked in successfully");
      }
    } catch (e) {
      toast.error("Failed to clock in");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleClockOut = async () => {
    const sesId = activeSessionData?.id || activeSessionId;
    if (!sesId) return;
    setIsClockProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sesId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();

      const breaks = [...(sessionData?.breaks || [])];
      const activeBreak = breaks.find(b => !b.end);
      if (activeBreak) activeBreak.end = new Date();

      const jobsListCopy = [...(sessionData?.jobs || [])];
      const lastJob = jobsListCopy.length > 0 ? jobsListCopy[jobsListCopy.length - 1] : null;
      if (lastJob && !lastJob.end) lastJob.end = new Date();

      const loc = await getCurrentLocation();
      let onSite = true;

      let settings: any = null;
      try {
        const settingsSnap = await getDoc(doc(db, 'businesses', tenantId));
        if (settingsSnap.exists()) settings = settingsSnap.data();
      } catch (err) {
        console.warn(err);
      }

      let allowedClockOut = true;
      if (loc.lat !== null && loc.lng !== null) {
        if (settings?.siteLat && settings?.siteLng) {
          const dist = calculateDistance(
            loc.lat, loc.lng,
            parseFloat(settings.siteLat), parseFloat(settings.siteLng)
          );
          onSite = dist <= (settings.siteRadius || 500);
          allowedClockOut = dist <= ((settings.siteRadius || 500) * 2);
        }
      } else {
        onSite = false;
        allowedClockOut = false;
      }

      if (!allowedClockOut && settings && !settings.allowOffsiteClockIn && !permissions['timeclock.offsite']) {
        toast.error("Clocking out off-site is not allowed for your account.");
        return;
      }

      await updateDoc(sessionRef, {
        clockOut: {
          timestamp: new Date(),
          lat: loc.lat,
          lng: loc.lng,
          accuracy: loc.accuracy,
          onSite
        },
        status: 'completed',
        breaks,
        jobs: jobsListCopy,
        updatedAt: new Date()
      });

      await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, "Clocked Out");
      if (!impersonatedStaff) {
        resetClock();
      }
      toast.success("Clocked out successfully");
    } catch (e) {
      toast.error("Failed to clock out");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleStartBreak = async (type: 'lunch' | 'normal') => {
    const sesId = activeSessionData?.id || activeSessionId;
    if (!sesId) return;
    setIsClockProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sesId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobsListCopy = [...(sessionData?.jobs || [])];
      
      const lastJob = jobsListCopy.length > 0 ? jobsListCopy[jobsListCopy.length - 1] : null;
      let suspendedJob = null;
      
      if (lastJob && !lastJob.end) {
        lastJob.end = new Date();
        suspendedJob = {
          id: lastJob.id,
          name: lastJob.name,
          taskId: lastJob.taskId || null,
          taskName: lastJob.taskName || null
        };
      }
      
      const loc = await getCurrentLocation();

      breaks.push({
        type,
        start: new Date(),
        isPaid: type === 'lunch' ? false : true,
        suspendedJob,
        startLat: loc.lat,
        startLng: loc.lng
      });

      await updateDoc(sessionRef, {
        breaks,
        jobs: jobsListCopy,
        status: 'on_break',
        updatedAt: new Date()
      });

      await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, `Started Break (${type})`);
      if (!impersonatedStaff) {
        setClockStatus(type === 'lunch' ? 'on_lunch' : 'on_break', Date.now(), sesId);
      }
      toast.info(`Started ${type} break`);
    } catch (e) {
      toast.error("Failed to start break");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleEndBreak = async () => {
    const sesId = activeSessionData?.id || activeSessionId;
    if (!sesId) return;
    setIsClockProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sesId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobsListCopy = [...(sessionData?.jobs || [])];
      
      const activeBreak = breaks.find(b => !b.end);
      if (activeBreak) {
        activeBreak.end = new Date();
        
        // Auto-resume job if it was suspended
        if (activeBreak.suspendedJob) {
          jobsListCopy.push({
            id: activeBreak.suspendedJob.id,
            name: activeBreak.suspendedJob.name,
            taskId: activeBreak.suspendedJob.taskId || null,
            taskName: activeBreak.suspendedJob.taskName || null,
            start: new Date()
          });
        }
      }

      const loc = await getCurrentLocation();

      await updateDoc(sessionRef, {
        breaks,
        jobs: jobsListCopy,
        status: 'active',
        updatedAt: new Date()
      });

      await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, "Ended Break");
      if (!impersonatedStaff) {
        setClockStatus('clocked_in', Date.now(), sesId);
      }
      toast.success("Break ended successfully");
    } catch (e) {
      toast.error("Failed to end break");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, jobId: string, currentStatus: string) => {
    try {
      const newStatus = isTaskCompleted(currentStatus) ? 'pending' : 'completed';
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId);
      await updateDoc(taskRef, {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
        updatedAt: serverTimestamp()
      });
      toast.success(`Task marked as ${newStatus}`);
    } catch (err) {
      toast.error("Failed to update task status");
    }
  };

  const handleCheckboxClick = (e: any, task: any, job: any) => {
    e.stopPropagation();
    if (isTaskCompleted(task.status)) {
      handleToggleTaskStatus(task.id, job.id, task.status);
    } else {
      setActiveTaskForCompletion({
        id: task.id,
        title: task.title,
        jobId: job.id,
        jobTitle: job.title,
        bookTime: task.bookTime || 0,
        status: task.status
      });
    }
  };

  const toggleJobExpansion = (jobId: string) => {
    setExpandedJobs(prev => ({
      ...prev,
      [jobId]: !prev[jobId]
    }));
  };

  const handleTaskClick = (jobId: string, taskId: string) => {
    navigate(`/business/${tenantId}/task/${jobId}/${taskId}`);
  };

  const handleActiveClockClick = (ac: any) => {
    if (ac.taskId) {
      navigate(`/business/${tenantId}/task/${ac.id}/${ac.taskId}`);
    } else {
      navigate(`/business/${tenantId}/job/${ac.id}`);
    }
  };

  const getSortedTasks = (tasksList: any[], jobId: string) => {
    return [...tasksList].sort((a, b) => {
      const aCurrentClock = activeClocks.some((ac: any) => ac.id === jobId && ac.taskId === a.id);
      const bCurrentClock = activeClocks.some((ac: any) => ac.id === jobId && ac.taskId === b.id);
      if (aCurrentClock && !bCurrentClock) return -1;
      if (!aCurrentClock && bCurrentClock) return 1;

      const aHours = getHoursForTask(jobId, a.id);
      const bHours = getHoursForTask(jobId, b.id);
      const aCompleted = isTaskCompleted(a.status);
      const bCompleted = isTaskCompleted(b.status);

      const aHasTimeIncomplete = aHours > 0 && !aCompleted;
      const bHasTimeIncomplete = bHours > 0 && !bCompleted;

      if (aHasTimeIncomplete && !bHasTimeIncomplete) return -1;
      if (!aHasTimeIncomplete && bHasTimeIncomplete) return 1;

      // Keep completed tasks at the absolute bottom
      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;

      return 0;
    });
  };

  return (
    <div className="w-full mx-auto px-1.5 sm:px-4 py-3.5 space-y-3.5 text-zinc-200">
      {/* Top Banner Greeting & Daily Clock */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/80 p-4.5 md:p-5.5 rounded-2xl shadow-xl transition-all duration-300">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-black text-white tracking-wide flex flex-wrap items-center gap-2">
            <span>Hi, <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">{staffMember?.firstName || user?.displayName || 'Technician'}</span></span>
            <button
              onClick={() => navigate(`/business/${tenantId}/overview`)}
              className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-750 cursor-pointer"
            >
              Classic Version
            </button>
          </h1>
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2 text-zinc-500 font-sans text-xs">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Today's Time: <strong className="text-zinc-300 font-mono text-sm">{stats.clockedToday.toFixed(2)} hrs</strong></span>
            </div>
            
            <button 
              onClick={() => setShowStatsExpander(!showStatsExpander)}
              className="flex items-center gap-1 text-[11px] font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider mt-0.5 cursor-pointer"
            >
              <span>{showStatsExpander ? 'Hide Stats Summary' : 'View Time & Efficiency Stats'}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", showStatsExpander && "rotate-180")} />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showStatsExpander && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden mt-2 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-3.5 space-y-3 w-full max-w-sm"
              >
                <div className="grid grid-cols-3 gap-2 text-left">
                  {/* Headers */}
                  <div className="text-[10px] font-black uppercase text-zinc-550">Metric</div>
                  <div className="text-[10px] font-black uppercase text-zinc-550 text-right">Today</div>
                  <div className="text-[10px] font-black uppercase text-zinc-550 text-right">This Week</div>
                  
                  {/* Divider */}
                  <div className="col-span-3 border-b border-zinc-900 my-0.5" />
                  
                  {/* Clocked Hours */}
                  <div className="text-xs text-zinc-400 font-medium">Clocked Hours</div>
                  <div className="text-xs text-zinc-200 font-mono text-right">{stats.clockedToday.toFixed(2)}h</div>
                  <div className="text-xs text-zinc-200 font-mono text-right">{stats.clockedThisWeek.toFixed(2)}h</div>

                  {/* Book Hours */}
                  <div className="text-xs text-zinc-400 font-medium">Book Hours</div>
                  <div className="text-xs text-zinc-200 font-mono text-right">{stats.bookToday.toFixed(2)}h</div>
                  <div className="text-xs text-zinc-200 font-mono text-right">{stats.bookThisWeek.toFixed(2)}h</div>

                  {/* Efficiency */}
                  <div className="text-xs text-zinc-400 font-medium">Efficiency</div>
                  <div className={cn(
                    "text-xs font-mono font-bold text-right",
                    stats.efficiencyToday >= 100 ? "text-emerald-400" :
                    stats.efficiencyToday >= 85 ? "text-indigo-400" :
                    stats.efficiencyToday > 0 ? "text-amber-400" : "text-zinc-500"
                  )}>
                    {stats.efficiencyToday > 0 ? `${stats.efficiencyToday.toFixed(0)}%` : '—'}
                  </div>
                  <div className={cn(
                    "text-xs font-mono font-bold text-right",
                    stats.efficiencyThisWeek >= 100 ? "text-emerald-400" :
                    stats.efficiencyThisWeek >= 85 ? "text-indigo-400" :
                    stats.efficiencyThisWeek > 0 ? "text-amber-400" : "text-zinc-500"
                  )}>
                    {stats.efficiencyThisWeek > 0 ? `${stats.efficiencyThisWeek.toFixed(0)}%` : '—'}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Daily Time Clock Controls */}
        <div className="flex flex-wrap items-center gap-2 bg-zinc-950/70 p-2.5 border border-zinc-850 rounded-2xl w-full md:w-auto justify-between md:justify-start">
          {clockStatus !== 'clocked_in' && clockStatus !== 'clocked_out' && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5">
                <span className={cn(
                  "w-3 h-3 rounded-full animate-pulse shrink-0",
                  clockStatus === 'on_lunch' || clockStatus === 'on_break' ? 'bg-amber-500 shadow-md shadow-amber-500/50' :
                  'bg-zinc-600'
                )} />
                <span className="text-xs uppercase font-black tracking-widest text-zinc-450">
                  {clockStatus.replace('_', ' ')}
                </span>
              </div>
              <div className="hidden md:block h-6 w-px bg-zinc-800" />
            </>
          )}

          {/* Large buttons for easy tapping ("fat fingers") */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            {clockStatus === 'clocked_out' ? (
              <button
                disabled={isClockProcessing}
                onClick={handleClockIn}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black px-6 py-3 rounded-xl text-sm font-black transition-all cursor-pointer scale-100 active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                <Clock className="w-4 h-4" />
                Clock In for the Day
              </button>
            ) : (
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {clockStatus === 'clocked_in' && (
                  <>
                    <button
                      disabled={isClockProcessing}
                      onClick={() => handleStartBreak('lunch')}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-zinc-950 px-4 py-3 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-orange-500/15"
                    >
                      <Pizza className="w-4 h-4" />
                      Lunch
                    </button>
                    <button
                      disabled={isClockProcessing}
                      onClick={() => handleStartBreak('normal')}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 px-4 py-3 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-amber-500/15"
                    >
                      <Coffee className="w-4 h-4" />
                      Break
                    </button>
                  </>
                )}
                
                {(clockStatus === 'on_lunch' || clockStatus === 'on_break') && (
                  <button
                    disabled={isClockProcessing}
                    onClick={handleEndBreak}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-indigo-600/20 animate-bounce"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Resume Work
                  </button>
                )}

                <button
                  disabled={isClockProcessing}
                  onClick={handleClockOut}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-3 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-rose-600/20 active:scale-95"
                >
                  <Square className="w-3.5 h-3.5" />
                  Clock Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clocked In Tasks Section */}
      <div className="space-y-3">
        <h2 className="text-xs font-black tracking-widest text-zinc-400 uppercase flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Currently Clocked In
        </h2>

        {activeClocks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeClocks.map((ac: any) => (
              <div 
                key={`${ac.id}-${ac.taskId || 'job'}`}
                onClick={() => handleActiveClockClick(ac)}
                className="flex items-center justify-between p-5 bg-gradient-to-br from-indigo-950/20 to-zinc-900 border border-emerald-500/35 rounded-2xl shadow-xl hover:border-emerald-500/60 transition-all cursor-pointer group"
              >
                <div className="space-y-1.5 pr-4 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-indigo-400 font-black tracking-wider uppercase font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      Job #{ac.jobNumber}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-black tracking-widest uppercase flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>
                  
                  <h3 className="text-base font-black text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                    {ac.taskName || 'Job Labor'}
                  </h3>
                  <p className="text-xs text-zinc-400 font-sans line-clamp-1">
                    {ac.jobTitle}
                  </p>
                </div>

                <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Real-time Ticking Timer */}
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-555 uppercase font-black tracking-widest block font-sans">Time Tracked</span>
                    <span className="text-lg font-black text-white font-mono tracking-tight">{formatDuration(ac.start)}</span>
                  </div>

                  {/* Gigantic Stop Button */}
                  <button
                    onClick={() => clockOutOfJob(ac.id, ac.taskId)}
                    className="w-12 h-12 rounded-xl bg-rose-500/10 hover:bg-rose-500 hover:text-black border border-rose-500/25 hover:border-transparent text-rose-400 flex items-center justify-center transition-all cursor-pointer scale-100 active:scale-95 shadow-md shadow-rose-950/10"
                    title="Stop Clock"
                  >
                    <Square className="w-5 h-5 fill-current" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl text-center text-zinc-500 text-sm font-medium">
            {clockStatus === 'clocked_in' 
              ? 'You are not clocked into any tasks right now. Tap a task inside a job below to start tracking your time.'
              : 'Please clock in for the day to begin working and tracking time.'}
          </div>
        )}
      </div>

      {/* Jobs with Assigned Tasks Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-indigo-400 shrink-0" />
            <h2 className="text-xs font-black tracking-widest text-zinc-400 uppercase">
              My Assigned Jobs & Tasks
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-zinc-900 text-zinc-400 border border-zinc-850">
              {jobsWithAssignedTasks.length} {jobsWithAssignedTasks.length === 1 ? 'Job' : 'Jobs'}
            </span>
            {totalActiveRemainingHours > 0 && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Workload: {totalActiveRemainingHours.toFixed(1)}h remaining
              </span>
            )}
          </div>
        </div>

        {jobsWithAssignedTasks.length > 0 ? (
          <div className="space-y-3.5">
            {jobsWithAssignedTasks.map((job) => {
              const isExpanded = !!expandedJobs[job.id];
              const allAssignedTasks = myTasks.filter((t: any) => t.jobId === job.id);
              
              let jobRemainingHours = 0;
              job.tasks.forEach((task: any) => {
                if (!isTaskCompleted(task.status)) {
                  const hours = getHoursForTask(job.id, task.id);
                  const limit = parseFloat(task.bookTime) || 0;
                  if (task.payBasis !== 'hourly' && limit > 0) {
                    jobRemainingHours += Math.max(0, limit - hours);
                  }
                }
              });
              const completedCount = allAssignedTasks.filter((t: any) => isTaskCompleted(t.status)).length;
              const totalCount = allAssignedTasks.length;
              const activeZone = zones.find(z => z.currentJobId === job.id) || zones.find(z => z.id === job.bayId);
              
              // Find matching vehicle details
              const vehicle = job.vehicleId && job.vehicleId !== 'N/A'
                ? vehicles.find(v => v.id === job.vehicleId || v.vin === job.vehicleId)
                : null;

              return (
                <div 
                  key={job.id} 
                  className={cn(
                    "bg-zinc-900/40 border rounded-2xl overflow-hidden transition-all duration-300 shadow-md",
                    isExpanded ? "border-zinc-700 bg-zinc-900/60" : "border-zinc-800/80 hover:border-zinc-700/80"
                  )}
                >
                  {/* Job Header Row (Fat touch target) */}
                  <button
                    onClick={() => toggleJobExpansion(job.id)}
                    className="w-full flex items-center justify-between p-3.5 sm:p-5 text-left cursor-pointer transition-colors hover:bg-zinc-850/30 gap-4"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] text-zinc-450 font-black font-mono">
                          Job #{job.jobNumber}
                        </span>
                        {activeZone && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-955/80 text-zinc-300 flex items-center gap-1 font-sans border border-zinc-800">
                            <MapPin className="w-2.5 h-2.5 text-zinc-500" />
                            {activeZone.name}
                          </span>
                        )}
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block font-sans border",
                          job.status === 'In Progress' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                          'bg-zinc-850 text-zinc-450 border-zinc-800'
                        )}>
                          {job.status || 'Open'}
                        </span>
                        
                        {jobRemainingHours > 0 && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-450 border border-indigo-500/20 font-sans">
                            {jobRemainingHours.toFixed(1)}h left
                          </span>
                        )}

                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded border font-sans",
                          completedCount === totalCount
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-zinc-900 text-zinc-455 border-zinc-800"
                        )}>
                          {completedCount}/{totalCount} Done
                        </span>
                      </div>

                      <h3 className="text-base md:text-lg font-black text-white leading-tight">
                        {job.title}
                      </h3>
                      <p className="text-xs text-zinc-455 font-sans leading-normal">
                        {job.customerName || 'No Customer'}
                        {vehicle ? ` — ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : (job.vehicleId && job.vehicleId !== 'N/A' ? ` — (${job.vehicleId})` : '')}
                      </p>
                    </div>

                    {/* Expand Icon */}
                    <div className="w-8 h-8 rounded-xl bg-zinc-950/60 border border-zinc-850 flex items-center justify-center text-zinc-400 shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {/* Progress Bar Across the Job Card */}
                  <div className="w-full h-1 bg-zinc-955 border-t border-zinc-900/50">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        completedCount === totalCount ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" : "bg-indigo-500"
                      )}
                      style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Task List (Smooth slide down using Framer Motion) */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden border-t border-zinc-800/80 bg-zinc-950/20"
                      >
                        <div className="p-4 md:p-6 space-y-3">
                          {/* View Full Job Details Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/business/${tenantId}/job/${job.id}`);
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500 hover:text-black border border-indigo-500/25 hover:border-transparent text-indigo-400 py-3.5 rounded-xl text-sm font-black transition-all cursor-pointer scale-100 active:scale-95 shadow-md shadow-indigo-950/10 mb-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View Full Job Details
                          </button>

                          {/* Job-specific Task Search Box */}
                          <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                            <input
                              type="text"
                              placeholder="Search tasks in this job..."
                              value={jobTaskQueries[job.id] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setJobTaskQueries(prev => ({ ...prev, [job.id]: val }));
                              }}
                              className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-550 focus:outline-none focus:border-indigo-500/50 transition-colors"
                            />
                            {jobTaskQueries[job.id] && (
                              <button
                                onClick={() => setJobTaskQueries(prev => {
                                  const next = { ...prev };
                                  delete next[job.id];
                                  return next;
                                })}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300"
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          {(() => {
                            const jobQuery = (jobTaskQueries[job.id] || '').toLowerCase().trim();
                            const filteredTasks = job.tasks.filter((task: any) => {
                              if (!jobQuery) return true;
                              return (
                                task.title?.toLowerCase().includes(jobQuery) ||
                                task.description?.toLowerCase().includes(jobQuery)
                              );
                            });

                            if (filteredTasks.length === 0) {
                              return (
                                <p className="text-xs text-zinc-500 text-center py-4 font-medium italic">
                                  No tasks match your search inside this job.
                                </p>
                              );
                            }

                            return getSortedTasks(filteredTasks, job.id).map((task: any) => {
                            const isCurrentClock = activeClocks.some(
                              (ac: any) => ac.id === job.id && ac.taskId === task.id
                            );
                            const isCompleted = isTaskCompleted(task.status);

                            const latestNote = task.task_notes && task.task_notes.length > 0
                              ? [...task.task_notes].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
                              : null;

                            return (
                              <div
                                key={task.id}
                                onClick={() => handleTaskClick(job.id, task.id)}
                                className={cn(
                                  "flex items-center justify-between p-3 bg-zinc-900/60 hover:bg-zinc-850/40 border rounded-xl transition-all cursor-pointer gap-3",
                                  isCurrentClock 
                                    ? "border-emerald-500/30 bg-indigo-950/5" 
                                    : isCompleted 
                                      ? "border-zinc-900 opacity-60 bg-zinc-955/20"
                                      : "border-zinc-850 hover:border-zinc-800"
                                )}
                              >
                                {/* Left Checkbox for Completion (Fat hit target) */}
                                <button
                                  onClick={(e) => handleCheckboxClick(e, task, job)}
                                  className={cn(
                                    "w-8.5 h-8.5 rounded-full border flex items-center justify-center transition-all cursor-pointer shrink-0 scale-100 active:scale-90",
                                    isCompleted
                                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 hover:bg-emerald-500/35"
                                      : "bg-zinc-950/60 border-zinc-700 hover:border-indigo-400 text-transparent"
                                  )}
                                  title={isCompleted ? "Mark Incomplete" : "Mark Complete"}
                                >
                                  <Check className={cn("w-4.5 h-4.5 transition-opacity", isCompleted ? "opacity-100" : "opacity-0")} />
                                </button>

                                {/* Task Details (Middle clickable body) */}
                                <div className="flex-1 space-y-0.5 min-w-0">
                                  <h4 className={cn(
                                    "text-sm font-bold text-white leading-snug line-clamp-2",
                                    isCompleted && "line-through text-zinc-550 opacity-60"
                                  )}>
                                    {task.title}
                                  </h4>

                                  {/* Task Notes / Description */}
                                  {task.description && (
                                    <p className={cn(
                                      "text-xs text-zinc-450 leading-normal",
                                      isCompleted && "line-through text-zinc-650 opacity-60"
                                    )}>
                                      {task.description}
                                    </p>
                                  )}
                                  
                                  {latestNote && (
                                    <p className="text-[10px] text-indigo-400 italic line-clamp-2 bg-indigo-950/20 px-2 py-1 rounded border border-indigo-900/10 w-fit">
                                      Latest note: {latestNote.text || latestNote.noteText || ''}
                                    </p>
                                  )}
                                  
                                  {(() => {
                                    const hours = getHoursForTask(job.id, task.id);
                                    const isHourly = task.payBasis === 'hourly';
                                    const limit = parseFloat(task.bookTime) || 0;

                                    return (
                                      <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                        {task.priority && (
                                          <span className={cn(
                                            "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded",
                                            task.priority.includes('Critical') || task.priority.includes('High')
                                              ? 'bg-rose-500/10 text-rose-455 border border-rose-500/20'
                                              : 'bg-zinc-800 text-zinc-555 font-bold'
                                          )}>
                                            {task.priority}
                                          </span>
                                        )}
                                        {isHourly ? (
                                          <>
                                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                              Hourly
                                            </span>
                                            {hours > 0 && (
                                              <span className="text-[10px] text-zinc-400 font-mono">
                                                Logged: <strong className="text-indigo-400 font-semibold">{hours.toFixed(2)}h</strong>
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          <>
                                            {limit > 0 && (
                                              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                                                Est: {limit}h
                                              </span>
                                            )}
                                            {hours > 0 && (
                                              <span className="text-[10px] text-zinc-400 font-mono">
                                                Logged: <strong className="text-indigo-400 font-semibold">{hours.toFixed(2)}h</strong>
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Time Spent / Bar Graph (Only for flat-rate with logged hours and limit) */}
                                  {(() => {
                                    const hours = getHoursForTask(job.id, task.id);
                                    const isHourly = task.payBasis === 'hourly';
                                    const limit = parseFloat(task.bookTime) || 0;
                                    
                                    if (isHourly || limit === 0 || hours === 0) return null;

                                    const percentage = Math.min(100, (hours / limit) * 100);
                                    const remaining = limit - hours;
                                    
                                    return (
                                      <div className="pt-1.5 mt-1.5 border-t border-zinc-850/50 space-y-1" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex justify-between items-center text-[10px] text-zinc-500 font-sans">
                                          {remaining > 0 ? (
                                            <span className="text-emerald-400 font-bold">
                                              Remaining: <strong className="font-mono">{remaining.toFixed(2)}h</strong>
                                            </span>
                                          ) : (
                                            <span className="text-rose-455 font-bold animate-pulse">
                                              Over by: <strong className="font-mono">{Math.abs(remaining).toFixed(2)}h</strong>
                                            </span>
                                          )}
                                          <span className="font-mono text-[9px] text-zinc-400">{percentage.toFixed(0)}%</span>
                                        </div>
                                        
                                        <div className="w-full bg-zinc-955 rounded-full h-1 overflow-hidden border border-zinc-900">
                                          <div 
                                            className={cn(
                                              "h-full rounded-full transition-all duration-300",
                                              hours > limit 
                                                ? "bg-rose-500 shadow-md shadow-rose-500/40" 
                                                : hours > limit * 0.8 
                                                  ? "bg-amber-500 shadow-md shadow-amber-555/40" 
                                                  : "bg-emerald-500 shadow-md shadow-emerald-500/40"
                                            )}
                                            style={{ width: `${percentage}%` }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* Right Quick Clock In/Out Action Button (Fat target) */}
                                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    disabled={clockStatus === 'clocked_out'}
                                    onClick={() => {
                                      if (isCurrentClock) {
                                        clockOutOfJob(job.id, task.id);
                                      } else {
                                        clockIntoJob(job.id, job.title, task.id, task.title);
                                      }
                                    }}
                                    className={cn(
                                      "flex items-center gap-1.5 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer scale-100 active:scale-95 border",
                                      isCurrentClock
                                        ? "bg-rose-500/10 hover:bg-rose-500 hover:text-black border-rose-500/20 text-rose-450"
                                        : clockStatus === 'clocked_in'
                                          ? "bg-indigo-500/10 hover:bg-indigo-500 hover:text-black border-indigo-500/20 text-indigo-400"
                                          : "bg-transparent text-zinc-850 border-zinc-900 cursor-not-allowed text-zinc-700"
                                    )}
                                    title={clockStatus !== 'clocked_in' ? 'Clock in for the day to track task time' : ''}
                                  >
                                    {isCurrentClock ? (
                                      <>
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                        <span className="hidden sm:inline">Clock Out</span>
                                      </>
                                    ) : (
                                      <>
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span className="hidden sm:inline">Clock In</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })})()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-10 bg-zinc-900/30 border border-zinc-850/60 rounded-2xl text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto" />
            <span className="text-sm text-zinc-500 block font-medium">No active jobs with assigned tasks found.</span>
          </div>
        )}
      </div>

      {/* Previous / Referenced Jobs Section */}
      <div className="space-y-4 pt-6 border-t border-zinc-800/40 mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900/50 pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-zinc-550 shrink-0" />
            <h2 className="text-xs font-black tracking-widest text-zinc-550 uppercase">
              Previous & Completed Jobs
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-zinc-900/50 text-zinc-500 border border-zinc-850/50">
              {previousJobs.length} {previousJobs.length === 1 ? 'Job' : 'Jobs'}
            </span>
            {totalPreviousLoggedHours > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-zinc-900/50 text-zinc-500 border border-zinc-850/50">
                Total Logged: {totalPreviousLoggedHours.toFixed(1)}h
              </span>
            )}
          </div>
        </div>
          
          {previousJobs.length > 0 ? (
            <div className="space-y-3.5 opacity-75">
              {previousJobs.map((job) => {
                const isExpanded = !!expandedJobs[job.id];
                const allAssignedTasks = myTasks.filter((t: any) => t.jobId === job.id);
                const completedCount = allAssignedTasks.filter((t: any) => isTaskCompleted(t.status)).length;
                const totalCount = allAssignedTasks.length;
                const activeZone = zones.find(z => z.currentJobId === job.id) || zones.find(z => z.id === job.bayId);
                
                const vehicle = job.vehicleId && job.vehicleId !== 'N/A'
                  ? vehicles.find(v => v.id === job.vehicleId || v.vin === job.vehicleId)
                  : null;

                return (
                  <div 
                    key={job.id} 
                    className={cn(
                      "bg-zinc-900/20 border rounded-2xl overflow-hidden transition-all duration-300 shadow-sm",
                      isExpanded ? "border-zinc-800 bg-zinc-900/35" : "border-zinc-900 hover:border-zinc-800"
                    )}
                  >
                    {/* Job Header Row (Fat touch target) */}
                    <button
                      onClick={() => toggleJobExpansion(job.id)}
                      className="w-full flex items-center justify-between p-3.5 sm:p-5 text-left cursor-pointer transition-colors hover:bg-zinc-850/10 gap-4"
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[9px] text-zinc-555 font-black font-mono">
                            Job #{job.jobNumber}
                          </span>
                          {activeZone && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-955/40 text-zinc-400 flex items-center gap-1 font-sans border border-zinc-900">
                              <MapPin className="w-2.5 h-2.5 text-zinc-650" />
                              {activeZone.name}
                            </span>
                          )}
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block font-sans border bg-zinc-900/60 text-zinc-500 border-zinc-855">
                            {job.status || 'Closed'}
                          </span>
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded border font-sans bg-zinc-900/50 text-zinc-450 border-zinc-850">
                            {completedCount}/{totalCount} Done
                          </span>
                        </div>

                        <h3 className="text-base md:text-lg font-bold text-zinc-350 leading-tight">
                          {job.title}
                        </h3>
                        <p className="text-xs text-zinc-500 font-sans leading-normal">
                          {job.customerName || 'No Customer'}
                          {vehicle ? ` — ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : (job.vehicleId && job.vehicleId !== 'N/A' ? ` — (${job.vehicleId})` : '')}
                        </p>
                      </div>

                      {/* Expand Icon */}
                      <div className="w-8 h-8 rounded-xl bg-zinc-955/40 border border-zinc-900 flex items-center justify-center text-zinc-555 shrink-0">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {/* Progress Bar Across the Job Card */}
                    <div className="w-full h-1 bg-zinc-955 border-t border-zinc-900/50">
                      <div 
                        className={cn(
                          "h-full transition-all duration-500",
                          completedCount === totalCount ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" : "bg-indigo-500"
                        )}
                        style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                      />
                    </div>

                    {/* Task List (Smooth slide down using Framer Motion) */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                          className="overflow-hidden border-t border-zinc-900 bg-zinc-955/10"
                        >
                          <div className="p-4 md:p-6 space-y-3">
                            {/* View Full Job Details Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/business/${tenantId}/job/${job.id}`);
                              }}
                              className="w-full flex items-center justify-center gap-2 bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-850 text-zinc-400 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer scale-100 active:scale-95 shadow-sm mb-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              View Full Job Details
                            </button>

                            {/* Job-specific Task Search Box */}
                            <div className="relative mb-2">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                              <input
                                type="text"
                                placeholder="Search tasks in this job..."
                                value={jobTaskQueries[job.id] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setJobTaskQueries(prev => ({ ...prev, [job.id]: val }));
                                }}
                                className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-550 focus:outline-none focus:border-indigo-500/50 transition-colors"
                              />
                              {jobTaskQueries[job.id] && (
                                <button
                                  onClick={() => setJobTaskQueries(prev => {
                                    const next = { ...prev };
                                    delete next[job.id];
                                    return next;
                                  })}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300"
                                >
                                  Clear
                                </button>
                              )}
                            </div>

                            {(() => {
                              const jobQuery = (jobTaskQueries[job.id] || '').toLowerCase().trim();
                              const filteredTasks = job.tasks.filter((task: any) => {
                                if (!jobQuery) return true;
                                return (
                                  task.title?.toLowerCase().includes(jobQuery) ||
                                  task.description?.toLowerCase().includes(jobQuery)
                                );
                              });

                              if (filteredTasks.length === 0) {
                                  return (
                                    <p className="text-xs text-zinc-555 text-center py-4 font-medium italic">
                                      No tasks match your search inside this job.
                                    </p>
                                  );
                              }

                              return getSortedTasks(filteredTasks, job.id).map((task: any) => {
                              const isCurrentClock = activeClocks.some(
                                (ac: any) => ac.id === job.id && ac.taskId === task.id
                              );
                              const isCompleted = isTaskCompleted(task.status);

                              const latestNote = task.task_notes && task.task_notes.length > 0
                                ? [...task.task_notes].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
                                : null;

                              return (
                                <div
                                  key={task.id}
                                  onClick={() => handleTaskClick(job.id, task.id)}
                                  className={cn(
                                    "flex items-center justify-between p-4 bg-zinc-900/30 border rounded-xl transition-all cursor-pointer gap-4",
                                    isCompleted 
                                      ? "border-zinc-955 opacity-60 bg-zinc-955/10"
                                      : "border-zinc-900"
                                  )}
                                >
                                  {/* Left Checkbox for Completion */}
                                  <button
                                    onClick={(e) => handleCheckboxClick(e, task, job)}
                                    className={cn(
                                      "w-9 h-9 rounded-full border flex items-center justify-center transition-all cursor-pointer shrink-0 scale-100 active:scale-90",
                                      isCompleted
                                        ? "bg-emerald-500/10 border-emerald-500/60 text-emerald-400/80"
                                        : "bg-zinc-950/60 border-zinc-800 text-transparent"
                                    )}
                                  >
                                    <Check className={cn("w-5 h-5 transition-opacity", isCompleted ? "opacity-100" : "opacity-0")} />
                                  </button>

                                  {/* Task Details */}
                                  <div className="flex-1 space-y-1 min-w-0">
                                    <h4 className={cn(
                                      "text-sm font-bold text-zinc-400 leading-snug line-clamp-2",
                                      isCompleted && "line-through text-zinc-600 opacity-65"
                                    )}>
                                      {task.title}
                                    </h4>

                                    {task.description && (
                                      <p className={cn(
                                        "text-xs text-zinc-550 leading-normal",
                                        isCompleted && "line-through text-zinc-650 opacity-60"
                                      )}>
                                        {task.description}
                                      </p>
                                    )}
                                    
                                    {latestNote && (
                                      <p className="text-[10px] text-zinc-555 italic line-clamp-2 bg-zinc-955/10 px-2 py-1 rounded border border-zinc-900/10 w-fit">
                                        Latest note: {latestNote.text || latestNote.noteText || ''}
                                      </p>
                                    )}

                                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                      {task.priority && (
                                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900/60 text-zinc-500">
                                          {task.priority}
                                        </span>
                                      )}
                                      {task.payBasis === 'hourly' ? (
                                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900/60 text-zinc-500">
                                          Hourly
                                        </span>
                                      ) : (
                                        task.bookTime > 0 && (
                                          <span className="text-[10px] text-zinc-600 font-mono">
                                            Est: {task.bookTime} hrs
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </div>

                                  {/* Right Quick Clock In/Out */}
                                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      disabled={clockStatus === 'clocked_out'}
                                      onClick={() => {
                                        if (isCurrentClock) {
                                          clockOutOfJob(job.id, task.id);
                                        } else {
                                          clockIntoJob(job.id, job.title, task.id, task.title);
                                        }
                                      }}
                                      className={cn(
                                        "flex items-center gap-1.5 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer scale-100 active:scale-95 border",
                                        isCurrentClock
                                          ? "bg-rose-500/10 hover:bg-rose-500 hover:text-black border-rose-500/20 text-rose-455"
                                          : clockStatus === 'clocked_in'
                                            ? "bg-zinc-850/40 hover:bg-zinc-850 text-zinc-400 border-zinc-800"
                                            : "bg-transparent text-zinc-900 border-zinc-950 cursor-not-allowed text-zinc-700"
                                      )}
                                    >
                                      {isCurrentClock ? (
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                      ) : (
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                      )}
                                      <span className="hidden sm:inline">
                                        {isCurrentClock ? "Clock Out" : "Clock In"}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })})()}
                        </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 bg-zinc-900/10 border border-zinc-855/30 rounded-2xl text-center text-zinc-500 text-xs font-medium">
              No completed tasks or jobs to display yet.
            </div>
          )}
        </div>

      {/* Time Allocation completion modal */}
      {activeTaskForCompletion && (
        <TimeAllocationModal
          tenantId={tenantId}
          jobId={activeTaskForCompletion.jobId}
          jobTitle={activeTaskForCompletion.jobTitle}
          taskId={activeTaskForCompletion.id}
          taskTitle={activeTaskForCompletion.title}
          bookTime={parseFloat(activeTaskForCompletion.bookTime) || 0}
          timeLogs={timeLogsForJob}
          effectiveUserId={effectiveUserId || ''}
          onClose={() => setActiveTaskForCompletion(null)}
          onSuccess={async () => {
            const taskId = activeTaskForCompletion.id;
            const jobId = activeTaskForCompletion.jobId;
            const status = activeTaskForCompletion.status;
            setActiveTaskForCompletion(null);
            await handleToggleTaskStatus(taskId, jobId, status);
          }}
        />
      )}
    </div>
  );
}
