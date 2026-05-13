import React, { useState, useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { collection, query, where, getDocs, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, messagingPromise } from '../lib/firebase/config';
import { useAuthStore } from '../lib/auth/store';
import { Smartphone, BellRing, Share } from 'lucide-react';

interface DeviceSettingsProps {
  tenantId?: string;
}

export const DeviceSettings: React.FC<DeviceSettingsProps> = ({ tenantId }) => {
  const { user } = useAuthStore();
  
  // Notification State
  const [, setToken] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [permission, setPermission] = useState<string>('default');
  
  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    // Check initial notification permission
    if ('Notification' in window) {
      setPermission(Notification.permission);
      if (Notification.permission === 'granted') {
        setStatus('Notifications are enabled on this device.');
      } else if (Notification.permission === 'denied') {
        setStatus('Notifications are blocked by your browser settings.');
      }
    }

    // Check if already installed
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detect OS
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    // Listen for beforeinstallprompt on Android/PC
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstructions(!showInstructions);
    }
  };

  const requestPermission = async () => {
    try {
      setStatus('Requesting permission...');
      const perm = await Notification.requestPermission();
      setPermission(perm);
      
      if (perm === 'granted') {
        setStatus('Permission granted. Generating token...');
        
        const messaging = await messagingPromise;
        if (messaging) {
            const currentToken = await getToken(messaging);
            if (currentToken) {
                setToken(currentToken);
                setStatus('Push notifications enabled!');
                console.log('FCM Token:', currentToken);
                
                // Save to staff document
                if (user && tenantId) {
                  setStatus('Saving token to database...');
                  const staffQuery = query(
                    collection(db, `businesses/${tenantId}/staff`),
                    where('email', '==', user.email?.toLowerCase())
                  );
                  const staffSnap = await getDocs(staffQuery);
                  
                  if (!staffSnap.empty) {
                    const staffRef = staffSnap.docs[0].ref;
                    await updateDoc(staffRef, {
                      fcmTokens: arrayUnion(currentToken)
                    });
                    setStatus('Notifications enabled and linked to your profile!');
                  } else {
                    setStatus('Warning: Token generated but could not find staff profile to save it to.');
                  }
                }

            } else {
                setStatus('No registration token available. Request permission to generate one.');
            }
        } else {
            setStatus('Messaging is not initialized.');
        }
      } else {
        setStatus('Permission denied.');
      }
    } catch (error: any) {
      console.error('An error occurred while retrieving token. ', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-indigo-500/10 rounded-xl">
          <Smartphone className="w-6 h-6 text-indigo-500" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Device Settings</h3>
          <p className="text-xs text-zinc-500 font-medium">Manage notifications and app installation for this device.</p>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* Notifications Block */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800/50">
          <div className="flex items-center gap-2 mb-2">
            <BellRing className="w-4 h-4 text-zinc-500" />
            <h4 className="font-bold text-zinc-900 dark:text-white">Push Notifications</h4>
          </div>
          <p className="text-sm text-zinc-500 mb-4">Allow your browser to receive real-time alerts when someone chats on your jobs.</p>
          
          <button 
            className="w-full px-4 py-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl transition-all shadow-sm"
            onClick={requestPermission}
          >
            {permission === 'granted' ? 'Re-sync Notifications' : permission === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'}
          </button>
          
          {status && (
            <div className="mt-3 p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-lg text-xs font-bold text-center">
              {status}
            </div>
          )}
        </div>

        {/* PWA Block */}
        {!isStandalone && (
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="w-4 h-4 text-zinc-500" />
              <h4 className="font-bold text-zinc-900 dark:text-white">Install App</h4>
            </div>
            <p className="text-sm text-zinc-500 mb-4">Install UpfittersOS directly to your device for a better, full-screen experience.</p>
            
            {isIOS ? (
              <div className="text-xs text-zinc-600 dark:text-zinc-400 p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl leading-relaxed">
                <strong>iOS Users:</strong> Tap the <Share size={12} className="inline mx-1" /> Share icon at the bottom of Safari, then select <strong>"Add to Home Screen"</strong>.
              </div>
            ) : (
              <>
                <button 
                  className="w-full px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold rounded-xl transition-all shadow-sm"
                  onClick={handleInstallClick}
                >
                  {deferredPrompt ? 'Install App' : 'How to Install'}
                </button>
                
                {showInstructions && !deferredPrompt && (
                  <div className="mt-3 p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed animate-in fade-in slide-in-from-top-2">
                    {isAndroid ? (
                      <span><strong>Android Users:</strong> Tap the 3-dot menu icon in the top right of Chrome, then select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</span>
                    ) : (
                      <span><strong>Desktop Users:</strong> Look for the small monitor/install icon at the far right of your address bar (next to the bookmark star) and click it to install.</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
