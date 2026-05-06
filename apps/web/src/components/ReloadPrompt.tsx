import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Sparkles, Clock, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SNOOZE_DURATION = 4 * 60 * 60 * 1000; // 4 hours

export function ReloadPrompt() {
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(() => {
    const saved = localStorage.getItem('pwa_update_snooze');
    return saved ? parseInt(saved, 10) : null;
  });

  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        setRegistration(r);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  // Periodic update check & visibility check
  useEffect(() => {
    if (!registration) return;

    const checkUpdate = () => {
      registration.update();
    };

    const interval = setInterval(checkUpdate, UPDATE_CHECK_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkUpdate();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [registration]);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const snooze = () => {
    const until = Date.now() + SNOOZE_DURATION;
    setSnoozedUntil(until);
    localStorage.setItem('pwa_update_snooze', until.toString());
  };

  const isSnoozed = snoozedUntil && Date.now() < snoozedUntil;

  // Clear snooze if needRefresh is false (e.g. after update)
  useEffect(() => {
    if (!needRefresh && snoozedUntil) {
      setSnoozedUntil(null);
      localStorage.removeItem('pwa_update_snooze');
    }
  }, [needRefresh, snoozedUntil]);

  if (!offlineReady && !needRefresh) return null;
  
  // If snoozed, we only hide it if it's an update notification
  if (needRefresh && isSnoozed) {
    return (
      <div className="fixed bottom-6 right-6 z-[200]">
        <button 
          onClick={() => setSnoozedUntil(null)}
          className="p-3 bg-indigo-600 text-white rounded-full shadow-lg hover:scale-110 transition-transform active:scale-95 animate-pulse"
          title="Update Available"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[200] animate-in fade-in slide-in-from-bottom-8 duration-500 ease-out">
      <div className={cn(
        "relative overflow-hidden",
        "bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl",
        "border border-white/20 dark:border-zinc-800/50",
        "rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)]",
        "p-5 md:p-6 flex flex-col gap-5 max-w-sm w-[calc(100vw-3rem)]"
      )}>
        {/* Animated Background Element */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" />
        
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              "relative p-3 rounded-2xl flex-shrink-0",
              needRefresh 
                ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30" 
                : "bg-emerald-500/10 text-emerald-500"
            )}>
              {needRefresh ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin-slow" />
                  <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-yellow-300 animate-bounce" />
                </>
              ) : (
                <ArrowRight className="w-6 h-6" />
              )}
            </div>
            
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-white text-lg tracking-tight">
                {needRefresh ? 'Upgrade Available' : 'Ready for Offline'}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                {needRefresh 
                  ? 'A premium new version is ready with improvements.' 
                  : 'UpfittersOS is now cached and ready to work without internet.'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={close}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {needRefresh && (
          <div className="flex flex-col gap-3 relative">
            <button
              onClick={() => updateServiceWorker(true)}
              className="group w-full py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span>Refresh & Update Now</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            
            <button
              onClick={snooze}
              className="w-full py-2.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-xl font-medium text-xs transition-all flex items-center justify-center gap-2"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Remind me in 4 hours</span>
            </button>
          </div>
        )}

        {!needRefresh && (
          <button
            onClick={close}
            className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-2xl font-bold text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
          >
            Great, thanks!
          </button>
        )}
      </div>
    </div>
  );
}
