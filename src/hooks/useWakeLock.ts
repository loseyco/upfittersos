import { useState, useEffect, useCallback, useRef } from 'react';

export const useWakeLock = (shouldLock: boolean) => {
  const [isLocked, setIsLocked] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        const lock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = lock;
        setIsLocked(true);
        
        lock.addEventListener('release', () => {
          setIsLocked(false);
          wakeLockRef.current = null;
        });
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current !== null) {
      try {
        await wakeLockRef.current.release();
      } catch(e) {
        // Ignore if already released
      }
      wakeLockRef.current = null;
      setIsLocked(false);
    }
  }, []);

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (shouldLock && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [shouldLock, requestWakeLock]);

  // Master controller based on boolean
  useEffect(() => {
    if (shouldLock) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    
    return () => {
      releaseWakeLock();
    };
  }, [shouldLock, requestWakeLock, releaseWakeLock]);

  return { isLocked };
};
