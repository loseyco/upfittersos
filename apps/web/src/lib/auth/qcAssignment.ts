import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function assignQCStaffToTask(tenantId: string, jobId: string, taskId: string) {
  try {
    const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId);
    await updateDoc(taskRef, {
      updatedAt: new Date().toISOString()
    });
    console.log(`QC assignment requested for task ${taskId} (explicit assignment skipped to preserve original technician and paid time)`);
  } catch (error) {
    console.error('Error updating task for QC:', error);
  }
}

export async function assignQCStaffToJob(tenantId: string, jobId: string) {
  try {
    const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
    await updateDoc(jobRef, {
      updatedAt: new Date().toISOString()
    });
    console.log(`QC assignment requested for job ${jobId} (explicit assignment skipped to preserve original assignees and paid time)`);
  } catch (error) {
    console.error('Error updating job for QC:', error);
  }
}

export async function syncAllExistingQCEntries(tenantId: string) {
  // Explicit sync assignment is skipped to prevent overwriting assignees and paid time of QC staff
  console.log(`syncAllExistingQCEntries called for tenant ${tenantId} (sync skipped to preserve assignees)`);
  return;
}


