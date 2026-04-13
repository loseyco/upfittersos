import { useState } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { messaging, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export const usePushNotifications = () => {
    const { currentUser } = useAuth();
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );
    const [isSubscribing, setIsSubscribing] = useState(false);

    const requestPermissionAndSaveToken = async () => {
        if (!messaging) {
            console.warn('Push messaging is not supported in this browser.');
            return false;
        }

        if (!currentUser) {
            console.warn('User must be logged in to subscribe to push notifications.');
            return false;
        }

        setIsSubscribing(true);

        try {
            const permission = await Notification.requestPermission();
            setPermissionStatus(permission);

            if (permission === 'granted') {
                // Ensure this VAPID key is configured in your Firebase Console -> Cloud Messaging settings if you want to restrict origins.
                const currentToken = await getToken(messaging, { 
                    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY 
                });

                if (currentToken) {
                    await setDoc(doc(db, 'user_fcm_tokens', currentUser.uid), {
                        token: currentToken,
                        updatedAt: serverTimestamp(),
                        platform: 'web-pwa'
                    }, { merge: true });

                    return true;
                } else {
                    console.log('No registration token available. Request permission to generate one.');
                }
            } else {
                console.log('Notification permission not granted.');
            }
        } catch (error) {
            console.error('An error occurred while retrieving token. ', error);
        } finally {
            setIsSubscribing(false);
        }

        return false;
    };

    return {
        permissionStatus,
        isSubscribing,
        requestPermissionAndSaveToken
    };
};
