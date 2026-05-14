import { useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase/config';
import { toast } from 'sonner';

interface ActivityItem {
  id: string;
  title: string;
  message: string;
  timestamp: any;
  author: string;
  type: string;
}

export const ActivityFeedToastListener = ({ tenantId }: { tenantId: string }) => {
  const lastProcessedId = useRef<string | null>(null);
  const mountTime = useRef<number>(Date.now());

  useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL') return;

    // We only want to listen for NEW entries created after we mounted
    // to avoid a flood of notifications on page load
    const q = query(
      collection(db, `businesses/${tenantId}/activity_feed`),
      orderBy('timestamp', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as ActivityItem;
          const id = change.doc.id;
          
          // Get timestamp as JS Date
          const ts = data.timestamp instanceof Timestamp 
            ? data.timestamp.toMillis() 
            : typeof data.timestamp === 'number' 
              ? data.timestamp 
              : data.timestamp?.seconds 
                ? data.timestamp.seconds * 1000 
                : Date.now();

          // Skip if:
          // 1. It was created before we mounted
          // 2. We've already processed this ID
          // 3. (Optional) It's from the current user (disabled for now as users like the feedback)
          if (ts < mountTime.current - 5000) return; // 5s buffer
          if (id === lastProcessedId.current) return;
          
          lastProcessedId.current = id;

          // Trigger the 'Patrol Mode' Toast
          toast.info(data.title || 'Shop Update', {
            description: `${data.message}${data.author ? ` — ${data.author}` : ''}`,
            duration: 6000,
            position: 'top-right',
            // The global 'cop-lights-toast' class is already applied via Toaster toastOptions
          });
        }
      });
    }, (error) => {
      console.error('Activity Feed Listener Error:', error);
    });

    return () => unsubscribe();
  }, [tenantId]);

  return null;
};
