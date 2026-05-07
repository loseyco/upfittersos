import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

export function PullToRefresh({ onRefresh }: { onRefresh: () => void }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const startY = useRef(0);
  const isPulling = useRef(false);
  
  // Decouple the hold timer logic from the touch listeners to prevent constant re-binding
  useEffect(() => {
    if (!isHolding) {
      setHoldProgress(0);
      return;
    }

    const startTime = Date.now();
    const duration = 2000; // 2 seconds

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      
      setHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(timer);
        onRefresh();
        // Reset after a brief delay to show completion
        setTimeout(() => {
          setPullDistance(0);
          setIsHolding(false);
          setHoldProgress(0);
        }, 500);
      }
    }, 32); // ~30fps for smooth bar

    return () => clearInterval(timer);
  }, [isHolding, onRefresh]);

  useEffect(() => {
    const findScrollable = (el: HTMLElement | null): HTMLElement | null => {
      while (el) {
        const style = window.getComputedStyle(el);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    const handleTouchStart = (e: TouchEvent) => {
      const el = e.target as HTMLElement;
      const scrollable = findScrollable(el) || document.documentElement;
      
      if (scrollable.scrollTop === 0) {
        startY.current = e.touches[0].pageY;
        isPulling.current = true;
      } else {
        isPulling.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      
      const currentY = e.touches[0].pageY;
      const diffY = currentY - startY.current;
      
      if (diffY > 0) {
        const distance = Math.min(diffY * 0.35, 140);
        setPullDistance(distance);

        // Toggle holding state based on threshold
        if (distance > 100) {
          setIsHolding(true);
        } else {
          setIsHolding(false);
        }

        if (e.cancelable) e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      
      // If they release before the progress bar hits 100, cancel everything
      // We check the progress indirectly by letting the other useEffect handle it,
      // but we need to reset pullDistance here.
      setPullDistance(0);
      setIsHolding(false);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []); // Listeners are now stable

  if (pullDistance === 0 && !isHolding) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none flex flex-col items-center justify-center overflow-hidden transition-all duration-300 ease-out"
      style={{ 
        height: `${pullDistance}px`,
        backgroundColor: `rgba(0,0,0,${Math.min(pullDistance / 300, 0.05)})`
      }}
    >
      <div className="flex flex-col items-center">
        <div 
          className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-2xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center transform transition-transform"
          style={{ 
            scale: Math.min(0.5 + (pullDistance / 200), 1),
            rotate: `${pullDistance * 2}deg`
          }}
        >
          <div className="relative w-8 h-8">
            <RefreshCw className={`w-8 h-8 text-indigo-500 ${isHolding && holdProgress < 100 ? 'animate-pulse' : ''} ${holdProgress >= 100 ? 'animate-spin' : ''}`} />
            
            {isHolding && (
              <svg className="absolute -inset-2 -rotate-90 w-12 h-12">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="transparent"
                  className="text-zinc-100 dark:text-zinc-800"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="transparent"
                  strokeDasharray="125.6"
                  strokeDashoffset={125.6 - (125.6 * Math.min(holdProgress, 100)) / 100}
                  className="text-indigo-500 transition-all duration-75 ease-linear"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        </div>
        
        <div className="mt-6 flex flex-col items-center animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            {holdProgress >= 100 ? 'Refreshing...' : isHolding ? 'Hold 2 Seconds' : 'Pull to Refresh'}
          </p>
          {isHolding && (
            <div className="mt-2 w-32 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-75 ease-linear"
                style={{ width: `${holdProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
