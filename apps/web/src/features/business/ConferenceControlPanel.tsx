import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Tv, Clock, Activity, Users, TrendingUp, AlertTriangle, 
  Play, Pause, RotateCcw, Plus, Trash, Check, Laptop, Wifi, Sparkles, Sliders,
  Car, QrCode, Layout, Edit3, MapPin, PlusCircle, X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';

type TVMode = 'screensaver' | 'dashboard' | 'sales_crm' | 'morning_meeting' | 'weekly_review' | 'custom_presentation' | 'safety_alert' | 'bay_monitor' | 'parking_monitor' | 'timeclock_station';

interface AgendaItem {
  id: string;
  text: string;
  completed: boolean;
}

interface TVSettings {
  // Morning Standup Timer
  timerActive: boolean;
  timerDuration: number; // in seconds
  timerEndTime: number | null; // epoch timestamp in ms when running
  timerRemaining: number; // remaining seconds when paused/stopped
  agenda: AgendaItem[];
  
  // Custom Presentation Mode
  customTitle: string;
  customText: string;
  customStyle: 'indigo' | 'emerald' | 'amber' | 'ruby' | 'steel';

  // Safety Meeting / Alert Mode
  safetyTitle: string;
  safetyText: string;
  safetyLevel: 'info' | 'warning' | 'critical';
}

const DEFAULT_SETTINGS: TVSettings = {
  timerActive: false,
  timerDuration: 600, // 10 minutes
  timerEndTime: null,
  timerRemaining: 600,
  agenda: [
    { id: '1', text: 'Yesterday\'s Output & Key Wins', completed: false },
    { id: '2', text: 'Active Blockers & Safety Topics', completed: false },
    { id: '3', text: 'Today\'s Targets & Bay Allocations', completed: false },
    { id: '4', text: 'Open Floor Discussion', completed: false }
  ],
  customTitle: 'Welcome Team!',
  customText: 'Let\'s build something great today. Remember to log all book hours as you finish tasks.',
  customStyle: 'indigo',
  safetyTitle: 'Hearing Protection Area',
  safetyText: 'Loud machinery operation in progress. Eye and ear protection are strictly required on the shop floor today.',
  safetyLevel: 'warning'
};

const MODE_DETAILS: Record<TVMode, { label: string; description: string; icon: React.ElementType; color: string; bg: string }> = {
  screensaver: {
    label: 'Screensaver',
    description: 'Displays a large digital clock, custom company logo, and guest WiFi QR code.',
    icon: Clock,
    color: 'text-indigo-400 border-indigo-500/20',
    bg: 'from-indigo-500/10 to-transparent'
  },
  dashboard: {
    label: 'Shop Floor Dashboard',
    description: 'Displays real-time upfitting performance, completed jobs, active bays, and blockers.',
    icon: Activity,
    color: 'text-emerald-400 border-emerald-500/20',
    bg: 'from-emerald-500/10 to-transparent'
  },
  morning_meeting: {
    label: 'Morning Standup',
    description: 'Displays a meeting timer, agenda checklist, and daily crew focuses.',
    icon: Users,
    color: 'text-purple-400 border-purple-500/20',
    bg: 'from-purple-500/10 to-transparent'
  },
  weekly_review: {
    label: 'Weekly Review',
    description: 'Shows weekly hours targets, completed jobs ticker, and celebratory targets met state.',
    icon: TrendingUp,
    color: 'text-pink-400 border-pink-500/20',
    bg: 'from-pink-500/10 to-transparent'
  },
  custom_presentation: {
    label: 'Custom Presentation',
    description: 'Displays a custom title, announcement details, and guest WiFi details.',
    icon: Laptop,
    color: 'text-cyan-400 border-cyan-500/20',
    bg: 'from-cyan-500/10 to-transparent'
  },
  safety_alert: {
    label: 'Safety Meeting / Alert',
    description: 'Pushes high-impact safety topics or emergency warnings to the screen.',
    icon: AlertTriangle,
    color: 'text-amber-400 border-amber-500/20',
    bg: 'from-amber-500/10 to-transparent'
  },
  bay_monitor: {
    label: 'Bay Monitor (TV)',
    description: 'Displays the active upfitting bays and their current vehicles/crew.',
    icon: Layout,
    color: 'text-sky-400 border-sky-500/20',
    bg: 'from-sky-500/10 to-transparent'
  },
  parking_monitor: {
    label: 'Parking Key Monitor',
    description: 'Displays parking key allocations and vehicle locations.',
    icon: Car,
    color: 'text-orange-400 border-orange-500/20',
    bg: 'from-orange-500/10 to-transparent'
  },
  timeclock_station: {
    label: 'Timeclock Station',
    description: 'Turns the screen into an interactive payroll and attendance clock-in station.',
    icon: QrCode,
    color: 'text-teal-400 border-teal-500/20',
    bg: 'from-teal-500/10 to-transparent'
  },
  sales_crm: {
    label: 'Sales & CRM Pipeline Board',
    description: 'Displays real-time sales pipeline deals, active prospects, lead sources, and deal values on shop monitors.',
    icon: TrendingUp,
    color: 'text-indigo-400 border-indigo-500/20',
    bg: 'from-indigo-500/10 to-transparent'
  }
};

interface MonitorDoc {
  id: string;
  name: string;
  location?: string;
  displayMode: TVMode;
  conferenceTvModeExpiresAt?: any;
  settings?: TVSettings;
}

export function ConferenceControlPanel({ tenantId }: { tenantId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const setupMonitorIdParam = searchParams.get('setupMonitorId');

  // Monitor management states
  const [monitors, setMonitors] = useState<MonitorDoc[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [activeMonitor, setActiveMonitor] = useState<MonitorDoc | null>(null);
  
  // Create / Edit modal states
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingMonitorId, setPairingMonitorId] = useState('');
  const [monitorNameInput, setMonitorNameInput] = useState('');
  const [monitorLocationInput, setMonitorLocationInput] = useState('');
  const [isEditingMonitor, setIsEditingMonitor] = useState(false);
  
  // Wifi details
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  
  // Agenda / form values
  const [newAgendaText, setNewAgendaText] = useState('');
  const [previewRemaining, setPreviewRemaining] = useState<number>(600);

  // 1. Listen to global business details
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWifiSsid(data.guestWifiSsid || 'SAE - Guest');
        setWifiPassword(data.guestWifiPassword || '8557232878');
      }
    });
    return () => unsub();
  }, [tenantId]);

  // 2. Listen to monitors list
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, 'businesses', tenantId, 'monitors'), (snap) => {
      const list: MonitorDoc[] = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as MonitorDoc);
      });
      // Sort monitors by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setMonitors(list);

      // If no monitor is selected, or if the previously selected monitor was deleted, select first available
      if (list.length > 0) {
        setSelectedMonitorId(prev => {
          if (prev && list.some(m => m.id === prev)) return prev;
          return list[0].id;
        });
      } else {
        setSelectedMonitorId(null);
      }
    });
    return () => unsub();
  }, [tenantId]);

  // 3. Listen to the active selected monitor document
  useEffect(() => {
    if (!tenantId || !selectedMonitorId) {
      setActiveMonitor(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'businesses', tenantId, 'monitors', selectedMonitorId), (snap) => {
      if (snap.exists()) {
        setActiveMonitor({ id: snap.id, ...snap.data() } as MonitorDoc);
      } else {
        setActiveMonitor(null);
      }
    });
    return () => unsub();
  }, [tenantId, selectedMonitorId]);

  // 4. Handle pairing code from URL
  useEffect(() => {
    if (setupMonitorIdParam) {
      setPairingMonitorId(setupMonitorIdParam);
      setMonitorNameInput('');
      setMonitorLocationInput('');
      setIsEditingMonitor(false);
      setShowPairingModal(true);
    }
  }, [setupMonitorIdParam]);

  // 5. Standup timer local preview logic
  useEffect(() => {
    const settings = activeMonitor?.settings || DEFAULT_SETTINGS;
    const displayMode = activeMonitor?.displayMode || 'screensaver';

    if (displayMode !== 'morning_meeting' || !settings.timerActive || !settings.timerEndTime) {
      setPreviewRemaining(settings.timerRemaining ?? 600);
      return;
    }

    const interval = setInterval(() => {
      const expiresAt = typeof settings.timerEndTime === 'number' 
        ? settings.timerEndTime 
        : (settings.timerEndTime as any)?.toDate 
          ? (settings.timerEndTime as any).toDate().getTime() 
          : Number(settings.timerEndTime) || 0;
      
      const diff = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setPreviewRemaining(diff);

      if (diff === 0) {
        clearInterval(interval);
        handleTimerPause();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeMonitor?.displayMode, activeMonitor?.settings?.timerActive, activeMonitor?.settings?.timerEndTime, activeMonitor?.settings?.timerRemaining]);

  // Helpers to update active monitor settings
  const updateTvSettingsInDb = async (updatedSettings: Partial<TVSettings>) => {
    if (!tenantId || !selectedMonitorId || !activeMonitor) return;
    try {
      const currentSettings = activeMonitor.settings || DEFAULT_SETTINGS;
      const nextSettings = { ...currentSettings, ...updatedSettings };
      await updateDoc(doc(db, 'businesses', tenantId, 'monitors', selectedMonitorId), {
        settings: nextSettings
      });
    } catch (err) {
      console.error('Failed to update TV settings:', err);
      toast.error('Sync failure: Could not update TV settings');
    }
  };

  const setTvMode = async (mode: TVMode, durationHours: number | null = null) => {
    if (!tenantId || !selectedMonitorId) return;
    try {
      let expiresAt: Date | null = null;
      if (durationHours !== null) {
        expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
      }
      
      await updateDoc(doc(db, 'businesses', tenantId, 'monitors', selectedMonitorId), {
        displayMode: mode,
        conferenceTvModeExpiresAt: expiresAt
      });
      
      const modeLabel = MODE_DETAILS[mode].label;
      if (expiresAt) {
        toast.success(`TV set to "${modeLabel}" (reverts in ${durationHours} hr).`);
      } else {
        toast.success(`TV set to "${modeLabel}" permanently.`);
      }
    } catch (err) {
      console.error('Failed to set TV mode:', err);
      toast.error('Failed to update TV display mode');
    }
  };

  // Pairing Modal Action
  const handleRegisterMonitor = async () => {
    if (!monitorNameInput.trim()) {
      toast.error("Please enter a name for the monitor.");
      return;
    }

    try {
      const id = pairingMonitorId || `tv_${Math.random().toString(36).substr(2, 8)}`;
      await setDoc(doc(db, 'businesses', tenantId, 'monitors', id), {
        name: monitorNameInput.trim(),
        location: monitorLocationInput.trim(),
        displayMode: 'screensaver',
        conferenceTvModeExpiresAt: null,
        settings: DEFAULT_SETTINGS,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      setSelectedMonitorId(id);
      setShowPairingModal(false);
      
      // Clear URL parameter so refreshing doesn't prompt again
      if (setupMonitorIdParam) {
        searchParams.delete('setupMonitorId');
        setSearchParams(searchParams);
      }

      toast.success(isEditingMonitor ? "Monitor settings updated!" : "New TV paired successfully!");
    } catch (err) {
      console.error("Pairing error:", err);
      toast.error("Failed to register TV monitor.");
    }
  };

  const handleEditMonitorClick = () => {
    if (!activeMonitor) return;
    setPairingMonitorId(activeMonitor.id);
    setMonitorNameInput(activeMonitor.name);
    setMonitorLocationInput(activeMonitor.location || '');
    setIsEditingMonitor(true);
    setShowPairingModal(true);
  };

  const handleDeleteMonitor = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete and unbind "${name}"? The screen will reset to pairing mode.`)) {
      try {
        await deleteDoc(doc(db, 'businesses', tenantId, 'monitors', id));
        toast.success(`Monitor "${name}" removed.`);
      } catch (err) {
        console.error("Delete monitor failed:", err);
        toast.error("Failed to remove monitor config.");
      }
    }
  };

  // Timer Controls
  const settings = activeMonitor?.settings || DEFAULT_SETTINGS;

  const handleTimerStart = async () => {
    const remaining = settings.timerRemaining > 0 ? settings.timerRemaining : settings.timerDuration;
    const endTime = Date.now() + remaining * 1000;
    
    await updateTvSettingsInDb({
      timerActive: true,
      timerEndTime: endTime,
      timerRemaining: remaining
    });
    toast.success('Standup meeting timer started!');
  };

  const handleTimerPause = async () => {
    if (!settings.timerEndTime) return;
    const expiresAt = typeof settings.timerEndTime === 'number' 
      ? settings.timerEndTime 
      : (settings.timerEndTime as any).toDate 
        ? (settings.timerEndTime as any).toDate().getTime() 
        : Number(settings.timerEndTime) || 0;
    
    const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    
    await updateTvSettingsInDb({
      timerActive: false,
      timerEndTime: null,
      timerRemaining: remaining
    });
    toast.success('Timer paused.');
  };

  const handleTimerReset = async () => {
    await updateTvSettingsInDb({
      timerActive: false,
      timerEndTime: null,
      timerRemaining: settings.timerDuration
    });
    toast.success('Timer reset.');
  };

  const handleTimerDurationChange = async (durationSecs: number) => {
    await updateTvSettingsInDb({
      timerActive: false,
      timerEndTime: null,
      timerDuration: durationSecs,
      timerRemaining: durationSecs
    });
    toast.success(`Meeting duration set to ${durationSecs / 60} minutes.`);
  };

  // Agenda Actions
  const handleToggleAgenda = async (id: string) => {
    const updatedAgenda = settings.agenda.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    await updateTvSettingsInDb({ agenda: updatedAgenda });
  };

  const handleAddAgendaItem = async () => {
    if (!newAgendaText.trim()) return;
    const newItem: AgendaItem = {
      id: Date.now().toString(),
      text: newAgendaText.trim(),
      completed: false
    };
    await updateTvSettingsInDb({
      agenda: [...settings.agenda, newItem]
    });
    setNewAgendaText('');
    toast.success('Added agenda item.');
  };

  const handleRemoveAgendaItem = async (id: string) => {
    const updatedAgenda = settings.agenda.filter(item => item.id !== id);
    await updateTvSettingsInDb({ agenda: updatedAgenda });
    toast.success('Removed agenda item.');
  };

  const formatTimerValue = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getExpirationText = () => {
    const expiresAt = activeMonitor?.conferenceTvModeExpiresAt;
    if (!expiresAt) return 'Permanent';
    const expDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const diff = expDate.getTime() - Date.now();
    if (diff <= 0) return 'Expired (Reverting)';
    const m = Math.floor(diff / 60000);
    if (m < 60) return `Reverts in ${m}m`;
    const h = (diff / 3600000).toFixed(1);
    return `Reverts in ${h}h`;
  };

  return (
    <div className="space-y-6 text-zinc-100 p-1 md:p-4 max-w-7xl mx-auto font-sans relative">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5 text-indigo-400 font-bold uppercase tracking-wider text-xs">
            <Sliders className="w-4 h-4" /> In Development
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white mt-1">TV Monitor Remote Control Hub</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Dynamically register, group, and manage what displays on each shop TV screen.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setPairingMonitorId('');
              setMonitorNameInput('');
              setMonitorLocationInput('');
              setIsEditingMonitor(false);
              setShowPairingModal(true);
            }}
            className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95 shadow-md shadow-indigo-650/15"
          >
            <PlusCircle className="w-4 h-4" /> Add TV Monitor
          </button>
          <a
            href={`/business/${tenantId}/monitor`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95"
          >
            <Tv className="w-4 h-4 text-indigo-400" />
            Open TV Setup Screen ↗
          </a>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Monitors list & WiFi config (Col Span 4) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Registered Monitors List Card */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md rounded-[2rem] p-6 shadow-xl relative overflow-hidden">
            <h2 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4">TV Monitors ({monitors.length})</h2>
            
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 no-scrollbar mb-4">
              {monitors.map((m) => {
                const isSelected = selectedMonitorId === m.id;
                const ModeIcon = MODE_DETAILS[m.displayMode]?.icon || Tv;
                const modeLabel = MODE_DETAILS[m.displayMode]?.label || m.displayMode;

                return (
                  <div
                    key={m.id}
                    className={cn(
                      "p-3 rounded-2xl border transition-all flex items-center justify-between group",
                      isSelected
                        ? "bg-indigo-600/10 border-indigo-500/40 shadow-inner"
                        : "bg-zinc-900/40 border-zinc-850 hover:bg-zinc-900/80"
                    )}
                  >
                    <button
                      onClick={() => setSelectedMonitorId(m.id)}
                      className="flex items-center gap-3.5 min-w-0 text-left flex-1"
                    >
                      <div className={cn(
                        "p-2.5 rounded-xl border shrink-0 transition-transform",
                        isSelected ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-zinc-950 border-zinc-850 text-zinc-500"
                      )}>
                        <ModeIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-extrabold text-xs text-zinc-100 block truncate leading-tight">{m.name}</span>
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mt-1 truncate">
                          {m.location || 'No Location'} • <span className="text-indigo-400 font-semibold">{modeLabel}</span>
                        </span>
                      </div>
                    </button>
                    
                    <div className="flex gap-1 shrink-0 ml-3">
                      <button
                        onClick={() => handleDeleteMonitor(m.id, m.name)}
                        className="p-2 text-zinc-650 hover:text-red-400 transition-colors"
                        title="Unbind TV"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {monitors.length === 0 && (
                <div className="text-center py-10 bg-zinc-950/40 border border-zinc-850 border-dashed rounded-2xl p-4">
                  <Tv className="w-8 h-8 text-zinc-600 mx-auto mb-2 opacity-50" />
                  <span className="text-xs font-bold text-zinc-400 block uppercase tracking-wider">No Monitors Connected</span>
                  <p className="text-[10px] text-zinc-550 leading-relaxed font-semibold mt-1">
                    Pair a TV via QR Code or click "+ Add TV Monitor" to set up a manual config.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Wifi Config Card */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md rounded-[2rem] p-6 shadow-xl">
            <h2 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-indigo-400" /> Guest Wifi Details
            </h2>
            <p className="text-xs text-zinc-500 mb-4 font-semibold">
               SSID credentials that compile QR codes on TV screensaver modes.
            </p>
            <div className="space-y-3.5">
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Network Name (SSID)</span>
                <input 
                  type="text" 
                  value={wifiSsid}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setWifiSsid(val);
                    await updateDoc(doc(db, 'businesses', tenantId), { guestWifiSsid: val });
                  }}
                  className="w-full mt-1.5 px-3 py-2 bg-zinc-950/80 border border-zinc-850 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Password</span>
                <input 
                  type="text" 
                  value={wifiPassword}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setWifiPassword(val);
                    await updateDoc(doc(db, 'businesses', tenantId), { guestWifiPassword: val });
                  }}
                  className="w-full mt-1.5 px-3 py-2 bg-zinc-950/80 border border-zinc-850 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-indigo-500" 
                />
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: Active Monitor Controls (Col Span 8) */}
        <div className="lg:col-span-8 space-y-6">
          {activeMonitor ? (
            <>
              {/* Active Monitor Status Panel */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md rounded-[2rem] p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="flex justify-between items-start pb-4 border-b border-zinc-800/60 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-white">{activeMonitor.name}</span>
                      <button 
                        onClick={handleEditMonitorClick}
                        className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition"
                        title="Edit monitor info"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-zinc-600" /> Location: {activeMonitor.location || 'Lobby/Shop'}
                    </span>
                  </div>

                  <div className="flex flex-col items-end text-right">
                    <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider block">Duration timeout</span>
                    <span className="text-xs font-bold text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 px-2.5 py-0.5 rounded-full mt-1">
                      {getExpirationText()}
                    </span>
                  </div>
                </div>

                {/* Mode Selector */}
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-4">Set Monitor View</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(Object.keys(MODE_DETAILS) as TVMode[]).map((mode) => {
                    const details = MODE_DETAILS[mode];
                    const IconComponent = details.icon;
                    const isActive = activeMonitor.displayMode === mode;
                    
                    return (
                      <button
                        key={mode}
                        onClick={() => setTvMode(mode)}
                        className={cn(
                          "p-3.5 rounded-2xl border text-left flex gap-3.5 transition-all duration-300 relative overflow-hidden group select-none active:scale-98",
                          isActive
                            ? "bg-zinc-900 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.12)]"
                            : "bg-zinc-900/60 border-zinc-850 hover:bg-zinc-900 hover:border-zinc-800"
                        )}
                      >
                        {/* Glow highlight */}
                        <div className={cn(
                          "absolute top-0 left-0 w-16 h-16 bg-gradient-to-br opacity-0 transition-opacity duration-300 rounded-full blur-xl",
                          isActive ? "opacity-100" : "group-hover:opacity-40",
                          details.bg
                        )} />

                        <div className={cn(
                          "p-2.5 rounded-xl border shrink-0 relative z-10 transition-transform duration-300 group-hover:scale-105",
                          isActive ? "bg-indigo-500/10 border-indigo-500/30" : "bg-zinc-950 border-zinc-850",
                          details.color
                        )}>
                          <IconComponent className="w-4 h-4" />
                        </div>

                        <div className="relative z-10 min-w-0 flex flex-col justify-center">
                          <span className="font-extrabold text-[11px] md:text-xs text-zinc-100 truncate">{details.label}</span>
                          <span className="text-[8px] text-zinc-500 block truncate max-w-full mt-0.5 font-medium leading-none">
                            {details.description}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode Specific Configurations */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md rounded-[2rem] p-6 shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60 mb-6">
                  <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" /> View Settings
                  </h2>
                  <span className="text-xs font-bold text-zinc-550 uppercase tracking-widest">
                    Configuring: {MODE_DETAILS[activeMonitor.displayMode]?.label || activeMonitor.displayMode}
                  </span>
                </div>

                <AnimatePresence mode="wait">
                  {/* Screensaver */}
                  {activeMonitor.displayMode === 'screensaver' && (
                    <motion.div
                      key="screensaver-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 text-center py-6 text-zinc-400 animate-fade-in"
                    >
                      <Clock className="w-10 h-10 mx-auto text-indigo-400 opacity-60 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-350">Screensaver View Active</p>
                      <p className="text-xs max-w-md mx-auto text-zinc-500 font-semibold leading-relaxed">
                        This TV displays the digital clock, company logo, and guest WiFi QR code. wifi details are synced from the sidebar guest config.
                      </p>
                    </motion.div>
                  )}

                  {/* Shop Dashboard */}
                  {activeMonitor.displayMode === 'dashboard' && (
                    <motion.div
                      key="dashboard-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      <div className="p-4 bg-zinc-950/60 border border-zinc-850 rounded-2xl text-xs space-y-4">
                        <span className="font-extrabold text-zinc-300 uppercase tracking-widest block">Dashboard Timeout Configuration</span>
                        <p className="text-zinc-500 font-semibold leading-relaxed">
                          Choose how long the TV remains on the Shop Floor Dashboard before automatically reverting back to the screensaver.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                          {[1, 2, 4, 8].map((hours) => (
                            <button
                              key={hours}
                              onClick={() => setTvMode('dashboard', hours)}
                              className="py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-bold transition-all text-zinc-350 active:scale-95"
                            >
                              {hours} {hours === 1 ? 'Hour' : 'Hours'}
                            </button>
                          ))}
                        </div>
                        <div className="pt-2 border-t border-zinc-900">
                          <button
                            onClick={() => setTvMode('dashboard', null)}
                            className="py-2.5 px-4 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl text-xs font-extrabold transition-all active:scale-95 flex items-center gap-2"
                          >
                            Keep On Permanently
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Morning Meeting */}
                  {activeMonitor.displayMode === 'morning_meeting' && (
                    <motion.div
                      key="morning-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="grid grid-cols-1 md:grid-cols-12 gap-6"
                    >
                      {/* Timer controls */}
                      <div className="md:col-span-5 space-y-5 bg-zinc-950/40 p-5 rounded-3xl border border-zinc-850">
                        <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-purple-400" /> STANDUP TIMER
                        </h3>
                        
                        <div className="text-center space-y-2 py-4 bg-zinc-950 border border-zinc-900 rounded-2xl">
                          <span className="text-[10px] font-black text-zinc-550 uppercase tracking-widest block">Remaining Time</span>
                          <span className="font-mono font-black text-4xl text-purple-400 tracking-tight block">
                            {formatTimerValue(previewRemaining)}
                          </span>
                        </div>

                        <div className="flex gap-2 justify-center">
                          {settings.timerActive ? (
                            <button
                              onClick={handleTimerPause}
                              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all active:scale-95 flex-1 justify-center"
                            >
                              <Pause className="w-3.5 h-3.5" /> Pause
                            </button>
                          ) : (
                            <button
                              onClick={handleTimerStart}
                              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all active:scale-95 flex-1 justify-center"
                            >
                              <Play className="w-3.5 h-3.5" /> Start
                            </button>
                          )}
                          
                          <button
                            onClick={handleTimerReset}
                            className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl text-xs font-extrabold transition-all active:scale-95"
                            title="Reset Timer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Presets */}
                        <div className="space-y-2 border-t border-zinc-900 pt-4">
                          <span className="text-[9px] font-black text-zinc-550 uppercase tracking-widest block">Duration Presets</span>
                          <div className="grid grid-cols-3 gap-2">
                            {[300, 600, 900].map((secs) => (
                              <button
                                key={secs}
                                onClick={() => handleTimerDurationChange(secs)}
                                className={cn(
                                  "py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-all text-center",
                                  settings.timerDuration === secs
                                    ? "bg-purple-500/10 border-purple-500/30 text-purple-450"
                                    : "bg-zinc-900/60 border-zinc-850 hover:bg-zinc-850 hover:text-zinc-200 text-zinc-400"
                                )}
                              >
                                {secs / 60} Min
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Agenda checklist */}
                      <div className="md:col-span-7 space-y-4">
                        <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-purple-400" /> SYNCED AGENDA CHECKLIST
                        </h3>

                        <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1 no-scrollbar">
                          {settings.agenda?.map((item) => (
                            <div 
                              key={item.id}
                              className="flex items-center justify-between p-3 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-800 rounded-xl transition-all group animate-fade-in"
                            >
                              <button
                                onClick={() => handleToggleAgenda(item.id)}
                                className="flex items-center gap-3 min-w-0 text-left flex-1"
                              >
                                <div className={cn(
                                  "w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0",
                                  item.completed
                                    ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_10px_rgba(147,51,234,0.3)]"
                                    : "border-zinc-800 bg-zinc-950"
                                )}>
                                  {item.completed && <Check className="w-3.5 h-3.5" />}
                                </div>
                                <span className={cn(
                                  "text-xs font-bold transition-all truncate pr-2",
                                  item.completed ? "text-zinc-500 line-through font-semibold" : "text-zinc-200"
                                )}>
                                  {item.text}
                                </span>
                              </button>
                              
                              <button
                                onClick={() => handleRemoveAgendaItem(item.id)}
                                className="p-1 text-zinc-650 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete item"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}

                          {(!settings.agenda || settings.agenda.length === 0) && (
                            <div className="text-center py-8 text-zinc-600 bg-zinc-900/20 border border-zinc-850 border-dashed rounded-2xl">
                              No agenda items added yet.
                            </div>
                          )}
                        </div>

                        {/* Add agenda input */}
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder="Add checklist item..."
                            value={newAgendaText}
                            onChange={(e) => setNewAgendaText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddAgendaItem()}
                            className="flex-1 px-3 py-2 bg-zinc-950/80 border border-zinc-850 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-purple-500 placeholder-zinc-700"
                          />
                          <button
                            onClick={handleAddAgendaItem}
                            className="p-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-extrabold transition-all active:scale-95 shrink-0"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Weekly Review */}
                  {activeMonitor.displayMode === 'weekly_review' && (
                    <motion.div
                      key="weekly-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 text-center py-6 text-zinc-400"
                    >
                      <TrendingUp className="w-10 h-10 mx-auto text-pink-400 opacity-60 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-350">Weekly Performance View Active</p>
                      <p className="text-xs max-w-md mx-auto text-zinc-550 font-semibold leading-relaxed">
                        This view shows overall combined hours logged, weekly targets progress, completed upfits count, and a celebratory job ticker. Excellent for weekly standups or management summaries.
                      </p>
                    </motion.div>
                  )}

                  {/* Custom Presentation */}
                  {activeMonitor.displayMode === 'custom_presentation' && (
                    <motion.div
                      key="custom-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-5 animate-fade-in"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Slide Header / Topic</span>
                          <input 
                            type="text"
                            value={settings.customTitle}
                            placeholder="Welcome Special Guests!"
                            onChange={(e) => updateTvSettingsInDb({ customTitle: e.target.value })}
                            className="w-full mt-1.5 px-3 py-2 bg-zinc-950/80 border border-zinc-855 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block font-semibold">Background Theme</span>
                          <div className="grid grid-cols-5 gap-2 mt-1.5">
                            {(['indigo', 'emerald', 'amber', 'ruby', 'steel'] as const).map((styleName) => (
                              <button
                                key={styleName}
                                onClick={() => updateTvSettingsInDb({ customStyle: styleName })}
                                className={cn(
                                  "h-8 rounded-lg border text-[10px] font-bold capitalize flex items-center justify-center transition-all select-none active:scale-95",
                                  settings.customStyle === styleName
                                    ? "border-cyan-500 text-white font-extrabold bg-zinc-900"
                                    : "border-zinc-850 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                                )}
                              >
                                <div className={cn(
                                  "w-2.5 h-2.5 rounded-full mr-1 shrink-0",
                                  styleName === 'indigo' && 'bg-indigo-500',
                                  styleName === 'emerald' && 'bg-emerald-500',
                                  styleName === 'amber' && 'bg-amber-500',
                                  styleName === 'ruby' && 'bg-rose-500',
                                  styleName === 'steel' && 'bg-slate-450'
                                )} />
                                {styleName === 'ruby' ? 'Ruby' : styleName}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block font-semibold">Slide Details / Bullet Points</span>
                        <textarea 
                          rows={4}
                          value={settings.customText}
                          placeholder="Write notes, agenda items, or announcements here..."
                          onChange={(e) => updateTvSettingsInDb({ customText: e.target.value })}
                          className="w-full mt-1.5 px-3 py-2 bg-zinc-950/80 border border-zinc-850 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-cyan-500 placeholder-zinc-700 resize-none"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Safety Meeting / Alert */}
                  {activeMonitor.displayMode === 'safety_alert' && (
                    <motion.div
                      key="safety-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-5"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block font-semibold">Safety Topic / Header</span>
                          <input 
                            type="text"
                            value={settings.safetyTitle}
                            placeholder="Safety Standdown Meeting"
                            onChange={(e) => updateTvSettingsInDb({ safetyTitle: e.target.value })}
                            className="w-full mt-1.5 px-3 py-2 bg-zinc-950/80 border border-zinc-850 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Alert Warning Level</span>
                          <div className="grid grid-cols-3 gap-2 mt-1.5">
                            {(['info', 'warning', 'critical'] as const).map((level) => (
                              <button
                                key={level}
                                onClick={() => updateTvSettingsInDb({ safetyLevel: level })}
                                className={cn(
                                  "h-8 rounded-lg border text-[10px] font-bold capitalize flex items-center justify-center transition-all select-none active:scale-95",
                                  settings.safetyLevel === level
                                    ? level === 'critical'
                                      ? "border-rose-500 text-rose-455 bg-rose-500/5 font-extrabold"
                                      : level === 'warning'
                                        ? "border-amber-500 text-amber-455 bg-amber-500/5 font-extrabold"
                                        : "border-sky-500 text-sky-455 bg-sky-500/5 font-extrabold"
                                    : "border-zinc-850 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                                )}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Safety Guidelines / Details</span>
                        <textarea 
                          rows={4}
                          value={settings.safetyText}
                          placeholder="Enter details of the safety topics..."
                          onChange={(e) => updateTvSettingsInDb({ safetyText: e.target.value })}
                          className="w-full mt-1.5 px-3 py-2 bg-zinc-950/80 border border-zinc-850 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-amber-500 placeholder-zinc-700 resize-none"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Shop Floor Bay Monitor */}
                  {activeMonitor.displayMode === 'bay_monitor' && (
                    <motion.div
                      key="bay-monitor-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 text-center py-6 text-zinc-400"
                    >
                      <Layout className="w-10 h-10 mx-auto text-sky-400 opacity-60 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-350">Shop Bay Monitor View Active</p>
                      <p className="text-xs max-w-md mx-auto text-zinc-500 font-semibold leading-relaxed">
                        This TV displays the complete live upfitting floor status showing all active bays, vehicle VIN assignments, and technicians clocked in. Setup is managed in the Zones configuration menu.
                      </p>
                    </motion.div>
                  )}

                  {/* Parking Key Monitor */}
                  {activeMonitor.displayMode === 'parking_monitor' && (
                    <motion.div
                      key="parking-monitor-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 text-center py-6 text-zinc-400"
                    >
                      <Car className="w-10 h-10 mx-auto text-orange-400 opacity-60 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-350">Parking Key Monitor View Active</p>
                      <p className="text-xs max-w-md mx-auto text-zinc-500 font-semibold leading-relaxed">
                        This TV displays the parking lot key layout, highlighting key positions and vehicle assignments. Settings are managed in the parking key layout dashboard.
                      </p>
                    </motion.div>
                  )}

                  {/* Timeclock Station */}
                  {activeMonitor.displayMode === 'timeclock_station' && (
                    <motion.div
                      key="timeclock-station-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 text-center py-6 text-zinc-400"
                    >
                      <QrCode className="w-10 h-10 mx-auto text-teal-400 opacity-60 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-355">Payroll Timeclock Station View Active</p>
                      <p className="text-xs max-w-md mx-auto text-zinc-500 font-semibold leading-relaxed">
                        This TV displays the QR code timeclock login screen for technicians to scan and log hours off/on-site.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md rounded-[2.5rem] p-12 text-center text-zinc-400 h-96 flex flex-col items-center justify-center">
              <Tv className="w-12 h-12 text-zinc-650 mb-3 opacity-60" />
              <h2 className="text-lg font-black text-white tracking-tight uppercase">Select a TV Monitor</h2>
              <p className="text-xs text-zinc-500 font-bold max-w-sm mt-1 leading-normal">
                Choose a TV monitor config from the left sidebar list or register a new one to begin remote controls.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Pairing & Setup Modal Popup */}
      <AnimatePresence>
        {showPairingModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 max-w-md w-full rounded-[2.5rem] p-8 shadow-2xl relative"
            >
              <button
                onClick={() => {
                  setShowPairingModal(false);
                  if (setupMonitorIdParam) {
                    searchParams.delete('setupMonitorId');
                    setSearchParams(searchParams);
                  }
                }}
                className="absolute top-6 right-6 p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-black text-white tracking-tight uppercase flex items-center gap-2">
                <Tv className="w-5 h-5 text-indigo-400" />
                {isEditingMonitor ? 'Edit TV Details' : 'Pair New TV Screen'}
              </h2>
              <p className="text-xs text-zinc-400 font-semibold leading-normal mt-1.5">
                {isEditingMonitor 
                  ? 'Update settings for this registered TV screen.' 
                  : 'A new TV screen is connecting. Give it a descriptive name to complete pairing.'}
              </p>

              <div className="space-y-4 mt-6">
                <div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Monitor Name</span>
                  <input
                    type="text"
                    placeholder="e.g. Boardroom TV"
                    value={monitorNameInput}
                    onChange={(e) => setMonitorNameInput(e.target.value)}
                    className="w-full mt-1.5 px-3.5 py-2.5 bg-zinc-950 border border-zinc-850 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                
                <div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Location Description</span>
                  <input
                    type="text"
                    placeholder="e.g. Conference Room"
                    value={monitorLocationInput}
                    onChange={(e) => setMonitorLocationInput(e.target.value)}
                    className="w-full mt-1.5 px-3.5 py-2.5 bg-zinc-950 border border-zinc-850 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {pairingMonitorId && (
                  <div className="py-2 px-3 bg-zinc-950/60 border border-zinc-850 rounded-xl flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0" />
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest font-mono truncate">Code: {pairingMonitorId}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-zinc-850 mt-6">
                  <button
                    onClick={() => {
                      setShowPairingModal(false);
                      if (setupMonitorIdParam) {
                        searchParams.delete('setupMonitorId');
                        setSearchParams(searchParams);
                      }
                    }}
                    className="px-4 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRegisterMonitor}
                    className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition flex-1"
                  >
                    {isEditingMonitor ? 'Save Changes' : 'Pair Monitor'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
