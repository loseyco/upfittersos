import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export type ActivityAction = 'STATUS_CHANGE' | 'TASK_START' | 'TASK_STOP' | 'BLOCKER_ADDED' | 'BLOCKER_RESOLVED' | 'NOTE_ADDED' | 'SYSTEM';

export interface ActivityPayload {
    action: ActivityAction;
    jobId?: string;
    jobTitle?: string;
    taskTitle?: string;
    userId: string;
    userName?: string;
    details: string;
    photoUrl?: string;
}

export const logBusinessActivity = async (tenantId: string, payload: ActivityPayload) => {
    try {
        await addDoc(collection(db, 'businesses', tenantId, 'business_events'), {
            ...payload,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error("Failed to log business activity:", err);
    }
};
