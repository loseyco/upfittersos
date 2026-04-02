import { useState, useEffect, useCallback } from 'react';

export const useWakeLock = (shouldLock: boolean) => {
  const [isLocked, setIsLocked] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
        setIsLocked(true);
        
        lock.addEventListener('release', () => {
          setIsLocked(false);
          setWakeLock(null);
        });
      }
    } catch (err: any) {
      console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock !== null) {
      await wakeLock.release();
      setWakeLock(null);
      setIsLocked(false);
    }
  }, [wakeLock]);

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
