import React, { useState, useEffect } from 'react';
import { Download, Bell, X } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useAuth } from '../contexts/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const PWAPrompt: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isStandalone, setIsStandalone] = useState(true); // Default true to avoid flash
    const [isIOS, setIsIOS] = useState(false);
    const [isMobileDevice, setIsMobileDevice] = useState(false);
    const [gpsEnabled, setGpsEnabled] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    
    // Check if we are currently snoozing the prompt
    const [dismissSession, setDismissSession] = useState(() => {
        const snoozed = localStorage.getItem('sae_pwa_snooze');
        if (snoozed) {
            const expiry = parseInt(snoozed, 10);
            if (Date.now() < expiry) return true;
        }
        return false;
    });

    const { permissionStatus, requestPermissionAndSaveToken, isSubscribing } = usePushNotifications();

    useEffect(() => {
        // Detect if the app is currently running in standalone mode (PWA installed)
        const checkStandalone = () => {
            const isMatch = window.matchMedia('(display-mode: standalone)').matches;
            const isIOSStandalone = (window.navigator as any).standalone === true;
            setIsStandalone(isMatch || isIOSStandalone);
        };

        checkStandalone();
        window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone);

        // Detect iOS and Mobile for custom instructions
        const userAgent = window.navigator.userAgent.toLowerCase();
        setIsIOS(/iphone|ipad|ipod/.test(userAgent));
        setIsMobileDevice(/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent));

        // Check if index.html already caught the prompt before React mounted
        if ((window as any).deferredPrompt) {
            setDeferredPrompt((window as any).deferredPrompt);
        }

        // Listen for new prompts (if Chrome fires it after mount)
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            (window as any).deferredPrompt = e;
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkStandalone);
        };
    }, []);

    useEffect(() => {
        // Track GPS Permission State natively using browser APIs if available
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' })
                .then(result => {
                    setGpsEnabled(result.state === 'granted');
                    result.onchange = () => {
                        setGpsEnabled(result.state === 'granted');
                    };
                }).catch(() => {
                    // Fallback to false if permission query fails
                    setGpsEnabled(false);
                });
        }
    }, []);

    const { currentUser } = useAuth();
    useEffect(() => {
        if (!currentUser) return;
        setDoc(doc(db, 'users', currentUser.uid), {
            deviceSetup: {
                pwaInstalled: isStandalone,
                pushEnabled: permissionStatus === 'granted',
                locationEnabled: gpsEnabled,
                isIOS: isIOS
            }
        }, { merge: true }).catch(console.error);
    }, [currentUser, isStandalone, permissionStatus, isIOS, gpsEnabled]);

    useEffect(() => {
        // Only show the prompt if we are not standalone OR if push is not granted
        // And the user has not dismissed it this session AND they are on a mobile device
        if (dismissSession || !isMobileDevice) {
            setShowPrompt(false);
            return;
        }

        const needsInstall = !isStandalone;
        const needsPush = permissionStatus === 'default';

        if (needsInstall || needsPush) {
            setShowPrompt(true);
        } else {
            setShowPrompt(false);
        }
    }, [isStandalone, permissionStatus, dismissSession]);

    const handleDismiss = () => {
        setDismissSession(true);
        // Snooze for 12 hours (12 * 60 * 60 * 1000)
        localStorage.setItem('sae_pwa_snooze', (Date.now() + 43200000).toString());
    };

    const handleInstallClick = async () => {
        const dp = deferredPrompt || (window as any).deferredPrompt;
        if (dp) {
            dp.prompt();
            const { outcome } = await dp.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
                (window as any).deferredPrompt = null;
            }
        }
    };

    const handlePushClick = async () => {
        await requestPermissionAndSaveToken();
    };

    if (!showPrompt) return null;

    const needsInstall = !isStandalone;
    const needsPush = permissionStatus === 'default';

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex items-end justify-end p-4 pointer-events-none">
            <div className="bg-white max-w-sm w-full rounded-2xl shadow-2xl border border-gray-100 overflow-hidden relative animate-in slide-in-from-bottom-5 duration-300 pointer-events-auto">
                <button 
                    onClick={handleDismiss}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition p-1 rounded-full hover:bg-gray-100"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Optimal Experience</h2>
                    <p className="text-sm text-gray-500 mb-6">
                        For real-time assignments and off-grid tracking, UpfittersOS requires installation and notifications.
                    </p>

                    <div className="space-y-4">
                        {needsInstall && (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-4 items-start">
                                <div className="bg-blue-600 text-white p-2 rounded-lg shrink-0">
                                    <Download className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-blue-900 text-sm">Install Application</h3>
                                    {isIOS && !deferredPrompt ? (
                                        <p className="text-xs text-blue-700 mt-1">
                                            Tap the <strong className="font-bold">Share</strong> icon at the bottom of Safari, then select <strong className="font-bold">Add to Home Screen</strong>.
                                        </p>
                                    ) : (
                                        <button 
                                            onClick={handleInstallClick}
                                            disabled={!deferredPrompt}
                                            className="mt-2 text-xs font-bold bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition w-full disabled:opacity-50"
                                        >
                                            Install Now
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {needsPush && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-4 items-start">
                                <div className="bg-amber-500 text-white p-2 rounded-lg shrink-0">
                                    <Bell className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-amber-900 text-sm">Enable Notifications</h3>
                                    <p className="text-xs text-amber-700 mt-1 mb-2">
                                        Required for mission commands and real-time alerts.
                                    </p>
                                    <button 
                                        onClick={handlePushClick}
                                        disabled={isSubscribing}
                                        className="text-xs font-bold bg-amber-500 text-white px-3 py-1.5 rounded-md hover:bg-amber-600 transition w-full disabled:opacity-50"
                                    >
                                        {isSubscribing ? 'Connecting...' : 'Allow Push Alerts'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="bg-gray-50 border-t border-gray-100 p-4 text-center">
                    <button 
                        onClick={handleDismiss}
                        className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                    >
                        Skip for now (Not Recommended)
                    </button>
                </div>
            </div>
        </div>
    );
};
