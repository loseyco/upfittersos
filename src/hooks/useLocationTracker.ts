import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export function useLocationTracker(tenantId: string, userId: string, isActive: boolean) {
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isActive || !tenantId || !userId || tenantId === 'GLOBAL') return;

        if (!('geolocation' in navigator)) {
            setError('Geolocation is not supported by your browser');
            return;
        }

        const updateLocation = async (position: GeolocationPosition) => {
            const { latitude: lat, longitude: lng, accuracy } = position.coords;
            try {
                // Throttle updates or just write them. Writing them directly might be fine if watched is throttled.
                const locationRef = doc(db, 'businesses', tenantId, 'staff_locations', userId);
                await setDoc(locationRef, {
                    userId,
                    lat,
                    lng,
                    accuracy,
                    timestamp: new Date().toISOString()
                }, { merge: true });
            } catch (err) {
                console.error("Failed to sync location to Firestore", err);
                setError('Failed to sync location');
            }
        };

        const handleError = (error: GeolocationPositionError) => {
            console.error("Geolocation error:", error.message);
            setError(error.message);
        };

        // Watch position continuously while active (usually updates on movement)
        const watchId = navigator.geolocation.watchPosition(updateLocation, handleError, {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 10000
        });

        // Also do an initial manual poll
        navigator.geolocation.getCurrentPosition(updateLocation, handleError, {
            enableHighAccuracy: true
        });

        return () => {
            navigator.geolocation.clearWatch(watchId);
        };
    }, [isActive, tenantId, userId]);

    return { error };
}
