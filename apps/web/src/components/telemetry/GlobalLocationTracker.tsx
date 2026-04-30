import { useEffect, useRef } from 'react';
import { useLocationStore } from '../../lib/store/locationStore';
import { useAuthStore } from '../../lib/auth/store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';

export function GlobalLocationTracker() {
  const { isSharing, targetEventId } = useLocationStore();
  const { user, tenantId } = useAuthStore();
  const intervalRef = useRef<any>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  if (targetEventId) {
    lastEventIdRef.current = targetEventId;
  }

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', user?.uid],
    queryFn: async () => {
      if (!user?.uid) return null;
      const snap = await getDoc(doc(db, 'users', user.uid));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!user?.uid
  });

  useEffect(() => {
    // If not sharing, ensure we clean up
    if (!isSharing || !targetEventId || !user?.uid || !tenantId || tenantId === 'GLOBAL') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Attempt to clean up the ping document if we just stopped sharing
      const cleanUpDoc = async () => {
        const eventIdToClean = lastEventIdRef.current;
        if (!isSharing && eventIdToClean && user?.uid && tenantId && tenantId !== 'GLOBAL') {
          try {
            const q = query(
              collection(db, `businesses/${tenantId}/business_events`), 
              where('eventId', '==', eventIdToClean), 
              where('name', '==', '📍 Staff Location Ping'),
              where('userId', '==', user.uid)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              await deleteDoc(doc(db, `businesses/${tenantId}/business_events`, snap.docs[0].id));
              queryClient.invalidateQueries({ queryKey: ['business-events', tenantId] });
            }
          } catch (e) {
            console.error('Error cleaning up location ping:', e);
          }
        }
      };
      
      cleanUpDoc();
      return;
    }

    if (!('geolocation' in navigator)) {
      console.warn('Geolocation not supported');
      return;
    }

    let userName = 'Staff Member';
    if (userProfile?.firstName) {
      userName = `${userProfile.firstName} ${userProfile.lastName || ''}`.trim();
    } else if (user?.displayName) {
      userName = user.displayName;
    } else if (user?.email) {
      userName = user.email;
    }

    const updateLocation = () => {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          const q = query(
            collection(db, `businesses/${tenantId}/business_events`), 
            where('eventId', '==', targetEventId), 
            where('name', '==', '📍 Staff Location Ping'),
            where('userId', '==', user.uid)
          );
          
          const snap = await getDocs(q);
          
          const payload = {
            name: '📍 Staff Location Ping',
            eventId: targetEventId,
            userId: user.uid,
            userName: userName,
            lat: latitude,
            lng: longitude,
            location: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`,
            date: new Date().toLocaleDateString(),
            notes: 'Sharing live location...',
            createdAt: new Date().toISOString()
          };

          if (!snap.empty) {
            await updateDoc(doc(db, `businesses/${tenantId}/business_events`, snap.docs[0].id), payload);
          } else {
            await addDoc(collection(db, `businesses/${tenantId}/business_events`), payload);
          }
          
          // Force UI to refresh on the Event page so the new ping appears immediately
          queryClient.invalidateQueries({ queryKey: ['business-events', tenantId] });
        } catch (err) {
          console.error('Error writing location to Firestore:', err);
        }
      }, (error) => {
        console.error('Geolocation error:', error);
      });
    };

    // Fire immediately
    updateLocation();
    
    // Then fire every 2 minutes
    intervalRef.current = setInterval(updateLocation, 120000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isSharing, targetEventId, user?.uid, tenantId, userProfile]);

  return null; // This component has no UI
}
