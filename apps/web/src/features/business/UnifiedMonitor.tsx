import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Tv, Wifi, ArrowRight
} from 'lucide-react';
import _QRCode from 'react-qr-code';
import { useParams } from 'react-router-dom';

type TVMode = 'screensaver' | 'dashboard' | 'morning_meeting' | 'weekly_review' | 'custom_presentation' | 'safety_alert' | 'bay_monitor' | 'parking_monitor' | 'timeclock_station';

// Import display modes
import { ConferenceRoomMonitor } from './ConferenceRoomMonitor';
import { BayMonitor } from './BayMonitor';
import { ParkingMonitor } from './ParkingMonitor';
import { TimeclockLoginMonitor } from '../timeclock/TimeclockLoginMonitor';

const QRCode = (_QRCode as any).default || _QRCode;

export function UnifiedMonitor({ tenantId }: { tenantId: string }) {
  const params = useParams();
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  
  // 1. Determine if a monitorId is explicitly passed in route splat (e.g., /monitor/:monitorId)
  // pathParts[0] would be 'monitor', pathParts[1] would be the monitorId
  const routeMonitorId = pathParts[0] === 'monitor' && pathParts[1] ? pathParts[1] : null;

  const [boundMonitorId, setBoundMonitorId] = useState<string | null>(() => {
    if (routeMonitorId) return routeMonitorId;
    return localStorage.getItem('bound_monitor_id');
  });

  const [tempSetupId] = useState(() => {
    // Generate a temporary pairing ID: tv_ + 8 characters
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let rand = '';
    for (let i = 0; i < 8; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `tv_${rand}`;
  });

  const [businessName, setBusinessName] = useState('UPFITTERS OS');
  const [wifiSsid, setWifiSsid] = useState('SAE - Guest');
  const [wifiPassword, setWifiPassword] = useState('8557232878');
  
  const [monitorConfig, setMonitorConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [availableMonitors, setAvailableMonitors] = useState<any[]>([]);

  // 1. Fetch global business details
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBusinessName(data.name || 'UPFITTERS OS');
        setWifiSsid(data.guestWifiSsid || 'SAE - Guest');
        setWifiPassword(data.guestWifiPassword || '8557232878');
      }
    });
    return () => unsub();
  }, [tenantId]);

  // 2. Fetch list of available monitors for manual selection on TV Setup Screen
  useEffect(() => {
    if (!tenantId || boundMonitorId) return;
    const unsub = onSnapshot(collection(db, 'businesses', tenantId, 'monitors'), (snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAvailableMonitors(list);
    });
    return () => unsub();
  }, [tenantId, boundMonitorId]);

  // 3. Listener for temporary setup document (Awaiting Pairing)
  useEffect(() => {
    if (!tenantId || boundMonitorId) {
      return;
    }

    setLoading(true);

    const unsub = onSnapshot(doc(db, 'businesses', tenantId, 'monitors', tempSetupId), (snap) => {
      if (snap.exists()) {
        // Document created by phone! Pairing successful!
        localStorage.setItem('bound_monitor_id', tempSetupId);
        setBoundMonitorId(tempSetupId);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId, boundMonitorId, tempSetupId]);

  // 4. Listener for the active bound monitor document
  useEffect(() => {
    if (!tenantId || !boundMonitorId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(doc(db, 'businesses', tenantId, 'monitors', boundMonitorId), (snap) => {
      if (!snap.exists()) {
        // Document was deleted from the control panel! Unbind.
        localStorage.removeItem('bound_monitor_id');
        setBoundMonitorId(null);
        setMonitorConfig(null);
      } else {
        setMonitorConfig(snap.data());
      }
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId, boundMonitorId]);

  // Manual reset of TV monitor
  const handleResetBinding = () => {
    if (window.confirm("Are you sure you want to disconnect this TV monitor? You will need to pair it again.")) {
      localStorage.removeItem('bound_monitor_id');
      setBoundMonitorId(null);
      setMonitorConfig(null);
    }
  };

  const handleManualSelection = (monitorId: string) => {
    localStorage.setItem('bound_monitor_id', monitorId);
    setBoundMonitorId(monitorId);
  };

  // Pairing QR Payload
  const pairingUrl = `${window.location.origin}/business/${tenantId}/conference_control?setupMonitorId=${tempSetupId}`;

  // If loading, show loading spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
        <div className="text-sm font-black tracking-widest uppercase text-zinc-550 animate-pulse">Loading Monitor Config...</div>
      </div>
    );
  }

  // If unbound, show the pairing screen
  if (!boundMonitorId) {
    return (
      <div className="min-h-screen text-white p-8 flex flex-col justify-between overflow-hidden font-sans relative select-none bg-gradient-to-br from-zinc-950 via-black to-zinc-900">
        
        {/* Floating gradient highlights */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[30%] -left-[20%] w-[70%] h-[90%] rounded-full bg-indigo-600/10 blur-[120px] animate-pulse" />
          <div className="absolute -bottom-[30%] -right-[20%] w-[70%] h-[90%] rounded-full bg-cyan-600/10 blur-[120px]" />
        </div>

        {/* Top Header */}
        <header className="flex items-center justify-between shrink-0 z-10 p-2">
          <div className="flex items-center gap-4">
            <img src="/saeg_logo.png" alt="SAE Logo" className="h-10 w-auto object-contain" />
            <div>
              <div className="text-xs font-black text-indigo-400 uppercase tracking-widest leading-none">{businessName}</div>
              <h1 className="text-lg font-black tracking-tight text-white mt-1 uppercase">TV Monitor Setup</h1>
            </div>
          </div>
          <div className="text-right flex flex-col justify-center border-l border-zinc-800 pl-6">
            <div className="text-xl font-mono font-black text-zinc-200">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-zinc-550 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              {new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Pairing Box */}
        <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 z-10 py-6 max-w-5xl mx-auto w-full">
          {/* Pairing QR Card (Col 1) */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 p-8 rounded-[2.5rem] backdrop-blur-md shadow-2xl flex flex-col items-center max-w-md w-full text-center">
            <span className="text-[10px] font-black tracking-[0.25em] text-indigo-400 uppercase mb-4">PAIR VIA QR CODE</span>
            
            {/* QR Code Container */}
            <div className="bg-white p-5 rounded-[2rem] shadow-inner border border-zinc-200 mb-6 relative group transition-transform duration-300 hover:scale-102">
              <QRCode value={pairingUrl} size={180} />
            </div>

            <h2 className="text-xl font-black text-white tracking-tight leading-snug">Register this TV Monitor</h2>
            <p className="text-xs text-zinc-400 font-semibold leading-relaxed mt-2 px-2">
              Scan this QR code with your phone/tablet to open the TV Control Panel and complete pairing.
            </p>
            
            <div className="mt-5 py-2.5 px-4 bg-zinc-950/80 border border-zinc-850 rounded-xl w-full flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">Pairing ID: {tempSetupId}</span>
            </div>
          </div>

          {/* Manual Selector / Instructions (Col 2) */}
          <div className="flex-1 space-y-6 max-w-md w-full">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-white tracking-tight uppercase flex items-center gap-2">
                <Tv className="w-5 h-5 text-indigo-400" /> Pairing Instructions
              </h3>
              <p className="text-xs text-zinc-400 font-semibold leading-relaxed">
                Upfitters OS supports consolidated monitors. Connect this display to any configuration preset created by managers.
              </p>
            </div>

            {/* Step-by-Step */}
            <div className="space-y-3.5">
              <div className="flex items-start gap-4 p-3.5 bg-zinc-900/20 border border-zinc-900 rounded-2xl">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-xs font-black shrink-0">1</div>
                <p className="text-xs font-semibold text-zinc-300 leading-relaxed">
                  Open the <strong className="text-indigo-400">TV Monitor Control</strong> page in the "In Development" section on your laptop/phone.
                </p>
              </div>
              <div className="flex items-start gap-4 p-3.5 bg-zinc-900/20 border border-zinc-900 rounded-2xl">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-xs font-black shrink-0">2</div>
                <p className="text-xs font-semibold text-zinc-300 leading-relaxed">
                  Enter the Pairing ID <strong className="text-indigo-400 font-mono">{tempSetupId}</strong> or simply scan the QR code to pair.
                </p>
              </div>
            </div>

            {/* Manual List selector */}
            {availableMonitors.length > 0 && (
              <div className="space-y-3 border-t border-zinc-800/80 pt-6">
                <span className="text-[10px] font-black text-zinc-550 uppercase tracking-widest block">OR BIND TO AN EXISTING CONFIG</span>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 no-scrollbar">
                  {availableMonitors.map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleManualSelection(m.id)}
                      className="w-full p-3 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-800 rounded-xl text-left flex items-center justify-between transition-all select-none active:scale-98"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-extrabold text-xs text-white block truncate">{m.name}</span>
                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mt-0.5">{m.location || 'No location'}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 ml-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center z-10 pt-6 mt-6 border-t border-zinc-900/60">
          <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider flex items-center justify-center gap-2">
            <Wifi className="w-3.5 h-3.5" /> GUEST NETWORK SSID: {wifiSsid} • Password: {wifiPassword}
          </div>
        </footer>

      </div>
    );
  }

  // Active Bound State
  // Extract active settings and displayMode
  const displayMode = (monitorConfig?.displayMode || 'screensaver') as TVMode;

  return (
    <div className="h-[100dvh] w-full overflow-hidden relative">
      
      {/* Hidden Disconnect Screen Overlay Trigger */}
      <div className="absolute top-4 left-4 z-50 group pointer-events-auto">
        <button 
          onDoubleClick={handleResetBinding}
          className="p-2 bg-zinc-950/20 hover:bg-zinc-900/80 text-zinc-650 hover:text-red-400 rounded-xl border border-transparent hover:border-zinc-800/50 backdrop-blur-sm transition-all duration-300 shadow-sm flex items-center gap-1.5 active:scale-95"
          title="Double click to reset monitor binding"
        >
          <Tv className="w-4 h-4" />
          <span className="text-[9px] font-black uppercase tracking-wider max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-out whitespace-nowrap">
            Double Click to Disconnect Screen
          </span>
        </button>
      </div>

      {/* Render subcomponents based on displayMode */}
      <div className="h-full w-full">
        {(() => {
          if (displayMode === 'bay_monitor') {
            return <BayMonitor tenantId={tenantId} />;
          }
          if (displayMode === 'parking_monitor') {
            return <ParkingMonitor tenantId={tenantId} />;
          }
          if (displayMode === 'timeclock_station') {
            return <TimeclockLoginMonitor tenantId={tenantId} />;
          }
          
          // Fallback to conference monitors (screensaver, dashboard, morning meeting, weekly review, custom message, safety alert)
          return (
            <ConferenceRoomMonitor 
              tenantId={tenantId} 
              monitorId={boundMonitorId}
            />
          );
        })()}
      </div>

    </div>
  );
}
