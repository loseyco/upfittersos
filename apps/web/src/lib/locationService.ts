import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase/config';

export interface GeoLocation {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}

export function getCurrentLocation(timeoutMs = 7000): Promise<GeoLocation> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: null, lng: null, accuracy: null });
      return;
    }
    
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn("Geolocation timeout exceeded.");
        resolve({ lat: null, lng: null, accuracy: null });
      }
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy || null,
          });
        }
      },
      (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          console.warn("Geolocation tracking error:", error);
          resolve({ lat: null, lng: null, accuracy: null });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0
      }
    );
  });
}

export async function updateStaffLastLocation(
  tenantId: string,
  userId: string | null | undefined,
  userEmail: string | null | undefined,
  location: GeoLocation,
  action: string
) {
  if (!tenantId || (!userId && !userEmail)) return;
  
  try {
    let staffDocRef = null;
    
    if (userEmail) {
      const q = query(
        collection(db, `businesses/${tenantId}/staff`),
        where('email', '==', userEmail.toLowerCase())
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        staffDocRef = doc(db, `businesses/${tenantId}/staff`, snap.docs[0].id);
      }
    }
    
    if (!staffDocRef && userId) {
      const q = query(
        collection(db, `businesses/${tenantId}/staff`),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        staffDocRef = doc(db, `businesses/${tenantId}/staff`, snap.docs[0].id);
      }
    }
    
    if (staffDocRef) {
      await updateDoc(staffDocRef, {
        lastLocation: {
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          updatedAt: new Date(),
          action
        }
      });
    }
  } catch (err) {
    console.error('Failed to update staff last location:', err);
  }
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
