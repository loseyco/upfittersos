import { useState, useEffect, useRef } from 'react';

export function useWakeLock(shouldKeepAwake: boolean) {
  const [isSupported, setIsSupported] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setIsSupported('wakeLock' in navigator);
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    const requestWakeLock = async () => {
      try {
        if (!wakeLockRef.current && shouldKeepAwake) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          wakeLockRef.current.addEventListener('release', () => {
            console.log('Wake Lock was released');
          });
          console.log('Wake Lock is active');
        }
      } catch (err: any) {
        console.error(`${err.name}, ${err.message}`);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Wake Lock released manually');
      }
    };

    if (shouldKeepAwake) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible' && shouldKeepAwake) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isSupported, shouldKeepAwake]);

  return { isSupported };
}
