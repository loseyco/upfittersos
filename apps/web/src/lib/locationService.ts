import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase/config';

export interface GeoLocation {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  type?: 'gps' | 'ip' | null;
}

export async function getIpLocation(): Promise<GeoLocation> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`ipapi.co returned status ${res.status}`);
    const data = await res.json();
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      return {
        lat: data.latitude,
        lng: data.longitude,
        accuracy: 15000, // 15km approximate
        type: 'ip'
      };
    }
  } catch (err) {
    console.warn("Failed to resolve IP location from ipapi.co fallback:", err);
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 1500);
      const res = await fetch('https://freeipapi.com/api/json', { signal: controller2.signal });
      clearTimeout(timer2);
      if (!res.ok) throw new Error(`freeipapi.com returned status ${res.status}`);
      const data = await res.json();
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        return {
          lat: data.latitude,
          lng: data.longitude,
          accuracy: 25000,
          type: 'ip'
        };
      }
    } catch (err2) {
      console.warn("Failed to resolve IP location from freeipapi.com fallback:", err2);
    }
  }
  return { lat: null, lng: null, accuracy: null, type: null };
}

export function getCurrentLocation(timeoutMs = 7000, forceGps = true): Promise<GeoLocation> {
  return new Promise((resolve) => {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const shouldForce = forceGps && isMobile;

    const getGpsLocation = () => {
      if (!navigator.geolocation) {
        if (shouldForce) {
          resolve({ lat: null, lng: null, accuracy: null, type: null });
        } else {
          getIpLocation().then(resolve);
        }
        return;
      }
      
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn("Geolocation timeout exceeded. Falling back to IP if not forced.");
          if (shouldForce) {
            resolve({ lat: null, lng: null, accuracy: null, type: null });
          } else {
            getIpLocation().then(resolve);
          }
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
              type: 'gps'
            });
          }
        },
        (error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            console.warn("Geolocation tracking error. Falling back to IP if not forced:", error);
            if (shouldForce) {
              resolve({ lat: null, lng: null, accuracy: null, type: null });
            } else {
              getIpLocation().then(resolve);
            }
          }
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0
        }
      );
    };

    if (!shouldForce) {
      if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        try {
          navigator.permissions.query({ name: 'geolocation' })
            .then((status) => {
              if (status.state === 'granted') {
                getGpsLocation();
              } else {
                getIpLocation().then(resolve);
              }
            })
            .catch((err) => {
              console.warn("Error querying geolocation permission, falling back to IP:", err);
              getIpLocation().then(resolve);
            });
        } catch (err) {
          console.warn("Exception thrown querying geolocation permission, falling back to IP:", err);
          getIpLocation().then(resolve);
        }
      } else {
        getIpLocation().then(resolve);
      }
    } else {
      getGpsLocation();
    }
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
          type: location.type || 'gps',
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
