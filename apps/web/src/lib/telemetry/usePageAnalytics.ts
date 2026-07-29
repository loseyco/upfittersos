import { useEffect, useRef } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../auth/store';

export function usePageAnalytics(activeTab: string, tenantId?: string) {
  const { user, impersonatedStaff } = useAuthStore();

  const activeDocIdRef = useRef<string | null>(null);
  const activeTenantIdRef = useRef<string | null>(null);
  const entryTimeRef = useRef<number>(0);

  useEffect(() => {
    // 1. Ignore localhost to prevent dev visits from polluting live tenant analytics
    const isLocalhost = 
      typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' ||
       window.location.hostname === '127.0.0.1' ||
       window.location.hostname.includes('localhost'));

    if (isLocalhost || !tenantId || tenantId === 'GLOBAL' || !activeTab) {
      return;
    }

    const now = Date.now();
    entryTimeRef.current = now;
    activeTenantIdRef.current = tenantId;

    const staffName = impersonatedStaff
      ? (impersonatedStaff.name || 'Staff').trim()
      : (user?.displayName || user?.email || 'User');
    const staffId = impersonatedStaff?.id || user?.uid || 'anonymous';
    const staffEmail = user?.email || '';

    let currentDocId: string | null = null;
    let isCancelled = false;

    // 2. Log page entry immediately upon page navigation
    addDoc(collection(db, `businesses/${tenantId}/page_analytics`), {
      pageId: activeTab,
      userUid: staffId,
      userName: staffName,
      userEmail: staffEmail,
      durationSeconds: 1,
      timestamp: serverTimestamp(),
      entryTime: new Date(now),
      exitTime: new Date(now),
      hostname: window.location.hostname
    }).then(docRef => {
      if (!isCancelled) {
        currentDocId = docRef.id;
        activeDocIdRef.current = docRef.id;
      }
    }).catch(err => {
      console.warn('[PageAnalytics] Log entry creation failed:', err);
    });

    // 3. Periodic heartbeat (every 10s) to persist duration while user stays on page
    const interval = setInterval(() => {
      if (currentDocId && !document.hidden && activeTenantIdRef.current) {
        const elapsedSec = Math.max(1, Math.round((Date.now() - entryTimeRef.current) / 1000));
        updateDoc(doc(db, `businesses/${activeTenantIdRef.current}/page_analytics`, currentDocId), {
          durationSeconds: elapsedSec,
          exitTime: new Date()
        }).catch(() => {});
      }
    }, 10000);

    // 4. Update final duration when navigating away or unmounting
    const updateFinalDuration = () => {
      if (currentDocId && activeTenantIdRef.current) {
        const finalSec = Math.max(1, Math.round((Date.now() - entryTimeRef.current) / 1000));
        updateDoc(doc(db, `businesses/${activeTenantIdRef.current}/page_analytics`, currentDocId), {
          durationSeconds: finalSec,
          exitTime: new Date()
        }).catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        updateFinalDuration();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      updateFinalDuration();
      activeDocIdRef.current = null;
    };
  }, [activeTab, tenantId, user?.uid, user?.email, impersonatedStaff?.id]);
}

