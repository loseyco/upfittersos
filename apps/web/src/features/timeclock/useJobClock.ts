import { useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { toast } from 'sonner';

export function useJobClock(tenantId: string) {
  const { activeSessionId } = useTimeclockStore();
  const [isProcessing, setIsProcessing] = useState(false);

  const clockIntoJob = async (jobId: string, jobName: string, taskId?: string, taskName?: string) => {
    if (!activeSessionId) {
      toast.error('Please clock in for the day first.');
      return;
    }

    setIsProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) {
        toast.error('Active session not found.');
        return;
      }

      const sessionData = sessionSnap.data();
      const jobs = [...(sessionData.jobs || [])];

      const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
      if (lastJob && !lastJob.end && lastJob.id === jobId && lastJob.taskId === taskId) {
        toast.info('Already clocked into this task.');
        setIsProcessing(false);
        return;
      }

      // Close previous job if open
      if (lastJob && !lastJob.end) {
        lastJob.end = new Date();
      }

      // Start new job segment
      jobs.push({
        id: jobId,
        name: jobName,
        taskId: taskId || null,
        taskName: taskName || null,
        start: new Date()
      });

      await updateDoc(sessionRef, {
        jobs,
        jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
        updatedAt: serverTimestamp()
      });

      toast.success(`Clocked into ${taskName || jobName}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to clock into job.');
    } finally {
      setIsProcessing(false);
    }
  };

  const clockOutOfJob = async () => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return;

      const sessionData = sessionSnap.data();
      const jobs = [...(sessionData.jobs || [])];
      
      const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
      if (lastJob && !lastJob.end) {
        lastJob.end = new Date();
        await updateDoc(sessionRef, {
          jobs,
          jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
          updatedAt: serverTimestamp()
        });
        toast.success(`Clocked out of ${lastJob.name}`);
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
