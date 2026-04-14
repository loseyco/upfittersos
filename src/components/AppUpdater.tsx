import { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react';

export function AppUpdater() {
    const [updateAvailable, setUpdateAvailable] = useState(false);

    useEffect(() => {
        // Only run polling in production, or if explicitly testing it locally
        // We'll always poll just to be safe, but local dev VITE_APP_VERSION is fixed
        const currentVersion = import.meta.env.VITE_APP_VERSION as string;
        
        if (!currentVersion) return; // If unversioned, abort

        const checkVersion = async () => {
            try {
                // Bypass cache explicitly
                const res = await fetch(`/version.json?t=${Date.now()}`);
                if (!res.ok) return;
                
                const data = await res.json();
                if (data.version && data.version !== currentVersion) {
                    setUpdateAvailable(true);
                }
            } catch (err) {
                // Ignore network errors offline
            }
        };

        // Check immediately on mount
        checkVersion();

        // Then check every 5 minutes
        const intervalId = setInterval(checkVersion, 5 * 60 * 1000);
        return () => clearInterval(intervalId);
    }, []);

    if (!updateAvailable) return null;

    return (
        <div className="fixed top-0 left-0 w-full z-[9999] p-4 flex justify-center items-start animate-in slide-in-from-top-10 fade-in duration-500 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl shadow-2xl overflow-hidden shadow-orange-500/20 max-w-2xl w-full pr-2 p-1 relative border border-orange-400">
                
                {/* Visual Flair */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 blur-2xl rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                
                <div className="flex bg-black/20 p-2.5 rounded-xl ml-1">
                    <Sparkles className="w-5 h-5 text-amber-100" />
                </div>
                
                <div className="flex-1 flex flex-col py-1">
                    <span className="text-white font-black uppercase tracking-widest text-[11px] leading-tight">Update Available</span>
                    <span className="text-amber-100/90 text-[10px] font-medium mt-0.5 leading-tight pr-4">
                        A new version of SAE OS has been published. Click to apply seamlessly.
                    </span>
                </div>
                
                <button 
                    onClick={() => {
                        // Nuke caches and force reload
                        if ('caches' in window) {
                            caches.keys().then((names) => {
                                for (const name of names) {
                                    caches.delete(name);
                                }
                            });
                        }
                        window.location.reload();
                    }}
                    className="flex shrink-0 items-center gap-2 bg-black hover:bg-black/80 text-white rounded-xl px-4 py-2.5 text-[11px] font-black tracking-widest uppercase transition-all shadow-inner border border-white/10 group"
                >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-180 transition-transform duration-500" />
                    Install Now <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:text-amber-400 transition-colors" />
                </button>
            </div>
        </div>
    );
}
