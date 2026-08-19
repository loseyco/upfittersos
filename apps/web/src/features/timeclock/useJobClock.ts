import { useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { getCurrentLocation, updateStaffLastLocation } from '../../lib/locationService';

export function useJobClock(tenantId: string, customActiveSessionId?: string | null, customStaffId?: string | null) {
  const storeSessionId = useTimeclockStore(state => state.activeSessionId);
  const activeSessionId = customActiveSessionId !== undefined ? customActiveSessionId : storeSessionId;
  const [isProcessing, setIsProcessing] = useState(false);

  const resolveTargetSessionId = async (): Promise<string | null> => {
    if (activeSessionId) return activeSessionId;
    const { user, impersonatedStaff } = useAuthStore.getState();
    const effectiveUserId = impersonatedStaff?.id || user?.uid;
    if (!effectiveUserId || !tenantId) return null;

    try {
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('userId', '==', effectiveUserId),
        where('status', 'in', ['active', 'on_break']),
        orderBy('clockIn.timestamp', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const foundId = snap.docs[0].id;
        useTimeclockStore.getState().setStatus('clocked_in', Date.now(), foundId);
        return foundId;
      }
    } catch (err) {
      console.warn("Could not dynamically resolve active session:", err);
    }
    return null;
  };

  const clockIntoJob = async (jobId: string, jobName: string, taskId?: string, taskName?: string) => {
    const targetSessionId = await resolveTargetSessionId();
    if (!targetSessionId) {
      toast.error('Please clock in for the day first.');
      return;
    }

    setIsProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, targetSessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists() || !sessionSnap.data()) {
        toast.error('Active session not found.');
        setIsProcessing(false);
        return;
      }

      const sessionData = sessionSnap.data()!;
      if (sessionData.status === 'completed' || sessionData.clockOut?.timestamp) {
        toast.error('Your previous shift has ended. Please clock in for the day first.');
        setIsProcessing(false);
        return;
      }

      const jobs = [...(sessionData.jobs || [])];

      // Check if already clocked into this specific task
      const isAlreadyClockedIn = jobs.some((j: any) => !j.end && j.id === jobId && j.taskId === taskId);
      if (isAlreadyClockedIn) {
        toast.info('Already clocked into this task.');
        setIsProcessing(false);
        return;
      }

      // Fetch task details if available
      let bookTime = 0;
      let payBasis = jobId === 'unassigned' ? 'hourly' : 'book_time';
      if (taskId && jobId !== 'unassigned') {
        try {
          const taskSnap = await getDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId));
          if (taskSnap.exists()) {
            const data = taskSnap.data();
            bookTime = parseFloat(data.bookTime) || 0;
            payBasis = data.payBasis || 'book_time';
          }
        } catch (err) {
          console.warn('Could not fetch task details', err);
        }
      }

      // Get geolocation if available
      const loc = await getCurrentLocation();

      // Start new job segment (without auto-closing others)
      jobs.push({
        id: jobId,
        name: jobName,
        taskId: taskId || null,
        taskName: taskName || null,
        bookTime,
        payBasis,
        start: new Date(),
        startLat: loc.lat,
        startLng: loc.lng
      });

      await updateDoc(sessionRef, {
        jobs,
        jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
        updatedAt: serverTimestamp()
      });

      // Update lastWorkedAt on the job itself for dashboard sorting
      if (jobId !== 'unassigned') {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
          lastWorkedAt: serverTimestamp()
        });
      }

      // Update staff last location
      const { user } = useAuthStore.getState();
      const staffId = customStaffId || user?.uid;
      await updateStaffLastLocation(tenantId, staffId, user?.email, loc, `Started Task: ${taskName || jobName}`);

      toast.success(`Clocked into ${taskName || jobName}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to clock into job.');
    } finally {
      setIsProcessing(false);
    }
  };

  const clockOutOfJob = async (jobId?: string, taskId?: string) => {
    const targetSessionId = await resolveTargetSessionId();
    if (!targetSessionId) return;
    setIsProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, targetSessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return;

      const sessionData = sessionSnap.data();
      const jobs = [...(sessionData.jobs || [])];
      
      let closedCount = 0;
      let closedName = '';

      const loc = await getCurrentLocation();

      jobs.forEach((j: any) => {
        if (!j.end) {
          // Flexible match logic:
          // 1. Close all active segments if no target specified
          // 2. Close all tasks for a specific job if only jobId is specified
          // 3. Close a specific task if both jobId and taskId are specified
          const isMatch = (!jobId && !taskId) || 
                          (jobId && !taskId && j.id === jobId) || 
                          (jobId && taskId && j.id === jobId && j.taskId === taskId);
          if (isMatch) {
            j.end = new Date();
            j.endLat = loc.lat;
            j.endLng = loc.lng;
            closedCount++;
            closedName = j.taskName || j.name || 'task';
          }
        }
      });

      if (closedCount > 0) {
        await updateDoc(sessionRef, {
          jobs,
          jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
          updatedAt: serverTimestamp()
        });

        const { user } = useAuthStore.getState();
        const staffId = customStaffId || user?.uid;
        await updateStaffLastLocation(
          tenantId, 
          staffId, 
          user?.email, 
          loc, 
          closedCount === 1 ? `Stopped Task: ${closedName}` : `Stopped ${closedCount} active tasks`
        );

        toast.success(closedCount === 1 ? `Clocked out of ${closedName}` : `Clocked out of ${closedCount} active tasks`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to clock out of job.');
    } finally {
      setIsProcessing(false);
    }
  };

  return { clockIntoJob, clockOutOfJob, isProcessing };
}

