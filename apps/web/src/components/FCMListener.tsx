import { useEffect } from 'react';
import { onMessage } from 'firebase/messaging';
import { messagingPromise } from '../lib/firebase/config';
import { toast } from 'sonner';

export const FCMListener = () => {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const messaging = await messagingPromise;
        if (messaging) {
          unsubscribe = onMessage(messaging, (payload) => {
            console.log('Received foreground message', payload);
            if (payload.notification) {
              const { title, body } = payload.notification;
              
              toast.info(title || 'Notification', {
                description: body,
                duration: 5000,
                position: 'top-center',
              });
            }
          });
        }
      } catch (e) {
        console.error('Failed to setup FCM listener', e);
      }
    };

    setupListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return null;
};
