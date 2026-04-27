import { db } from '../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface AuditLog {
  userId: string;
  actionType: 'LOGIN' | 'LOGOUT' | 'CLOCK_IN' | 'DATA_MUTATION' | 'SYSTEM_OVERSIGHT';
  targetEntityId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export async function submitAuditLog(tenantId: string | 'GLOBAL', log: AuditLog) {
  try {
    const payload = {
      ...log,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
      // Note: IP Address resolution typically requires server-side fetching (e.g. Cloud Functions)
      // For client-side, we omit or use a 3rd party API. Leaving blank for backend enrichment.
    };
    
    if (tenantId === 'GLOBAL') {
      await addDoc(collection(db, 'platform_logs'), payload);
    } else {
      // Rule 14: Tenant-scoped events go to the businesses sub-collection
      await addDoc(collection(db, `businesses/${tenantId}/audit_logs`), payload);
    }
  } catch (error) {
    console.error('Failed to submit audit log:', error);
  }
}
