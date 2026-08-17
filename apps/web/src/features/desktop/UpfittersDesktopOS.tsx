import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';
import { db } from '../../lib/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import { 
  Monitor, Lock, Settings, Minimize2, Maximize2, X, 
  Search, Sliders, Clock, Users, FileText, Wrench, 
  Activity, LayoutGrid, Terminal as TerminalIcon, BookOpen, Grid,
  Building2, ChevronDown, ShieldCheck, Check
} from 'lucide-react';
import { StaffRoster } from '../business/StaffRoster';
import { YellowSheets } from '../business/YellowSheets';
import { TimeclockSpreadsheet } from '../business/TimeclockSpreadsheet';
import { BayMonitor } from '../business/BayMonitor';
import { BusinessSettings } from '../business/BusinessSettings';
import { QuickDesk } from '../business/QuickDesk';
import { OverviewV3 } from '../business/OverviewV3';

export interface WindowInstance {
  id: string;
  appKey: string;
  title: string;
  icon: any;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
}

export type WallpaperPreset = 'carbon' | 'asphalt' | 'crimson' | 'slate';

interface BusinessItem {
  id: string;
  name: string;
}

interface UpfittersDesktopOSProps {
  tenantId?: string;
}

const DESKTOP_APPS = [
  {
    key: 'staff_roster',
    title: 'Staff Roster & Attendance',
    category: 'Staff & HR',
    icon: Users,
    defaultWidth: 1100,
    defaultHeight: 700,
    color: 'from-blue-600 to-indigo-700'
  },
  {
    key: 'yellow_sheets',
    title: 'Yellow Sheets Dispatcher',
    category: 'Operations',
    icon: FileText,
    defaultWidth: 1200,
    defaultHeight: 750,
    color: 'from-amber-500 to-yellow-600'
  },
  {
    key: 'timeclock',
    title: 'Time Clocks & Payroll',
    category: 'Staff & HR',
    icon: Clock,
    defaultWidth: 1100,
    defaultHeight: 700,
    color: 'from-emerald-600 to-teal-700'
  },
  {
    key: 'bay_monitor',
    title: 'Shop Bay & Parking Monitor',
    category: 'Shop Floor',
    icon: Wrench,
    defaultWidth: 1150,
    defaultHeight: 720,
    color: 'from-red-600 to-rose-700'
  },
  {
    key: 'quickdesk',
    title: 'QuickDesk Shop Apps',
    category: 'Operations',
    icon: LayoutGrid,
    defaultWidth: 1050,
    defaultHeight: 680,
    color: 'from-cyan-600 to-blue-700'
  },
  {
    key: 'overview',
    title: 'Shop Overview & Analytics',
    category: 'Management',
    icon: Activity,
    defaultWidth: 1100,
    defaultHeight: 700,
    color: 'from-purple-600 to-indigo-800'
  },
  {
    key: 'settings',
    title: 'Business & Shop Settings',
    category: 'Management',
    icon: Settings,
    defaultWidth: 950,
    defaultHeight: 650,
    color: 'from-neutral-700 to-neutral-900'
  },
  {
    key: 'terminal',
    title: 'Upfitters OS Terminal CLI',
    category: 'System',
    icon: TerminalIcon,
    defaultWidth: 750,
    defaultHeight: 480,
    color: 'from-zinc-800 to-black'
  },
  {
    key: 'notes',
    title: 'Shop Sticky Notes',
    category: 'System',
    icon: BookOpen,
    defaultWidth: 420,
    defaultHeight: 450,
    color: 'from-yellow-600/90 to-amber-700/90'
  }
];

export function UpfittersDesktopOS({ tenantId: initialTenantId = 'loseyco' }: UpfittersDesktopOSProps) {
  const navigate = useNavigate();
  const { user, isSuperAdmin, setTenantId: setStoreTenantId } = useAuthStore();
  const SUPER_ADMIN_EMAILS = ['p.losey@saegrp.com', 'loseyp@gmail.com'];
  const canSwitchBusiness = isSuperAdmin || (user?.email && SUPER_ADMIN_EMAILS.includes(user.email));

  const [currentTenantId, setCurrentTenantId] = useState<string>(initialTenantId);
  const [businessesList, setBusinessesList] = useState<BusinessItem[]>([]);
  const [showBusinessSwitcher, setShowBusinessSwitcher] = useState(false);
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(false);

  const [isLocked, setIsLocked] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [wallpaper, setWallpaper] = useState<WallpaperPreset>('carbon');
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [showControlCenter, setShowControlCenter] = useState(false);
  const [showWidgets, setShowWidgets] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Sticky Notes State
  const [notesText, setNotesText] = useState<string>(() => {
    return localStorage.getItem(`upfitters_os_notes_${currentTenantId}`) || 
      '• Bay 3 Lift Maintenance Scheduled: 08:00 AM\n• Rush Work Order #1049: Wiring Harness Check\n• Staff Shift Handover Notes: All bays clear by 6 PM';
  });

  // Terminal CLI State
  const [terminalHistory, setTerminalHistory] = useState<Array<{ cmd: string; output: string }>>([
    { cmd: 'system', output: `Upfitters OS v4.2.0 [Active Tenant: ${currentTenantId}]` },
    { cmd: 'help', output: 'Available commands: help, staff, yellowsheets, bays, clear, lock, version' }
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  // Window Management
  const [openWindows, setOpenWindows] = useState<WindowInstance[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [highestZIndex, setHighestZIndex] = useState(10);

  // Sync prop changes
  useEffect(() => {
    if (initialTenantId) {
      setCurrentTenantId(initialTenantId);
    }
  }, [initialTenantId]);

  // Fetch businesses for Super Admin Switcher
  useEffect(() => {
    if (showBusinessSwitcher && businessesList.length === 0) {
      setIsLoadingBusinesses(true);
      getDocs(collection(db, 'businesses'))
        .then(snap => {
          const list = snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || doc.id
          }));
          setBusinessesList(list);
        })
        .finally(() => setIsLoadingBusinesses(false));
    }
  }, [showBusinessSwitcher, businessesList.length]);

  const switchTenant = (newTenantId: string) => {
    setCurrentTenantId(newTenantId);
    setStoreTenantId(newTenantId);
    setShowBusinessSwitcher(false);
    navigate(`/business/${newTenantId}/desktop`);
  };

  // Fullscreen State & Listener
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(console.error);
      }
    }
  };

  // Clock Ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const openApp = (appKey: string) => {
    const appDef = DESKTOP_APPS.find(a => a.key === appKey);
    if (!appDef) return;

    const existing = openWindows.find(w => w.appKey === appKey);
    if (existing) {
      const nextZ = highestZIndex + 1;
      setHighestZIndex(nextZ);
      setOpenWindows(prev => prev.map(w => w.id === existing.id ? { ...w, isMinimized: false, zIndex: nextZ } : w));
      setActiveWindowId(existing.id);
      setShowStartMenu(false);
      return;
    }

    const nextZ = highestZIndex + 1;
    setHighestZIndex(nextZ);

    const newWindow: WindowInstance = {
      id: `win-${appKey}-${Date.now()}`,
      appKey,
      title: appDef.title,
      icon: appDef.icon,
      x: 80 + (openWindows.length * 30),
      y: 60 + (openWindows.length * 25),
      width: Math.min(appDef.defaultWidth, window.innerWidth - 60),
      height: Math.min(appDef.defaultHeight, window.innerHeight - 120),
      isMinimized: false,
      isMaximized: false,
      zIndex: nextZ
    };

    setOpenWindows(prev => [...prev, newWindow]);
    setActiveWindowId(newWindow.id);
    setShowStartMenu(false);
  };

  const closeWindow = (id: string) => {
    setOpenWindows(prev => prev.filter(w => w.id !== id));
    if (activeWindowId === id) {
      const remaining = openWindows.filter(w => w.id !== id);
      if (remaining.length > 0) {
        const topWindow = remaining.reduce((prev, curr) => curr.zIndex > prev.zIndex ? curr : prev);
        setActiveWindowId(topWindow.id);
      } else {
        setActiveWindowId(null);
      }
    }
  };

  const focusWindow = (id: string) => {
    const nextZ = highestZIndex + 1;
    setHighestZIndex(nextZ);
    setOpenWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: false, zIndex: nextZ } : w));
    setActiveWindowId(id);
  };

  const toggleMinimize = (id: string) => {
    setOpenWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: !w.isMinimized } : w));
  };

  const toggleMaximize = (id: string) => {
    setOpenWindows(prev => prev.map(w => w.id === id ? { ...w, isMaximized: !w.isMaximized } : w));
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = terminalInput.trim().toLowerCase();
    if (!cmd) return;

    let output = '';
    switch (cmd) {
      case 'help':
        output = 'Commands: help, staff, yellowsheets, bays, clear, lock, version';
        break;
      case 'staff':
        openApp('staff_roster');
        output = 'Launching Staff Roster window...';
        break;
      case 'yellowsheets':
        openApp('yellow_sheets');
        output = 'Launching Yellow Sheets Dispatcher...';
        break;
      case 'bays':
        openApp('bay_monitor');
        output = 'Launching Bay & Parking Monitor...';
        break;
      case 'clear':
        setTerminalHistory([]);
        setTerminalInput('');
        return;
      case 'lock':
        setIsLocked(true);
        output = 'Session locked.';
        break;
      case 'version':
        output = `Upfitters OS v4.2.0 [Tenant: ${currentTenantId}]`;
        break;
      default:
        output = `Command not recognized: '${cmd}'. Type 'help' for available commands.`;
    }

    setTerminalHistory(prev => [...prev, { cmd: terminalInput, output }]);
    setTerminalInput('');
  };

  const wallpaperBg = {
    carbon: 'bg-gradient-to-br from-neutral-950 via-neutral-900 to-black',
    asphalt: 'bg-gradient-to-br from-zinc-950 via-neutral-900 to-zinc-900',
    crimson: 'bg-gradient-to-br from-[#1c1c1e] via-[#bd2925]/40 to-black',
    slate: 'bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-900'
  }[wallpaper];

  const filteredApps = DESKTOP_APPS.filter(app => 
    app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`relative w-full h-screen overflow-hidden select-none text-white ${wallpaperBg}`}>
      {/* 1. TOP OS STATUS BAR */}
      <div className="absolute top-0 left-0 right-0 h-9 bg-black/60 backdrop-blur-xl border-b border-white/10 px-4 flex items-center justify-between z-50 text-xs">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setShowStartMenu(!showStartMenu)}
            className="flex items-center space-x-2 font-bold tracking-wider text-red-500 hover:text-red-400 transition"
          >
            <Monitor className="w-4 h-4" />
            <span className="uppercase">Upfitters OS</span>
          </button>
          <span className="text-white/20">|</span>

          {/* Super Admin Business Switcher Badge */}
          <div className="relative">
            <button 
              onClick={() => canSwitchBusiness && setShowBusinessSwitcher(!showBusinessSwitcher)}
              className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded border font-mono transition ${
                canSwitchBusiness 
                  ? 'bg-red-950/50 hover:bg-red-900/60 border-red-500/50 text-red-300 cursor-pointer' 
                  : 'bg-white/5 border-white/10 text-white/70'
              }`}
              title={canSwitchBusiness ? "Click to switch business tenant" : "Active Tenant"}
            >
              <Building2 className="w-3 h-3 text-red-400" />
              <span>Tenant: <strong className="text-white">{currentTenantId}</strong></span>
              {canSwitchBusiness && <ChevronDown className="w-3 h-3 text-red-400" />}
            </button>

            {/* Business Switcher Dropdown Modal */}
            {showBusinessSwitcher && (
              <div className="absolute top-8 left-0 w-64 bg-neutral-900/95 backdrop-blur-2xl border border-white/15 rounded-xl p-2 shadow-2xl z-50 space-y-1">
                <div className="text-[10px] font-mono uppercase text-red-400 px-2 py-1 flex items-center justify-between border-b border-white/10">
                  <span className="flex items-center space-x-1">
                    <ShieldCheck className="w-3 h-3 text-red-400" />
                    <span>Super Admin Switcher</span>
                  </span>
                  <button onClick={() => setShowBusinessSwitcher(false)}>
                    <X className="w-3 h-3 text-white/50 hover:text-white" />
                  </button>
                </div>

                {isLoadingBusinesses ? (
                  <div className="p-3 text-center text-xs text-white/50">Loading businesses...</div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {businessesList.map(biz => (
                      <button
                        key={biz.id}
                        onClick={() => switchTenant(biz.id)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-mono transition text-left ${
                          currentTenantId === biz.id 
                            ? 'bg-red-600/30 text-red-300 font-bold border border-red-500/40' 
                            : 'hover:bg-white/10 text-white/80'
                        }`}
                      >
                        <span className="truncate">{biz.name || biz.id}</span>
                        {currentTenantId === biz.id && <Check className="w-3.5 h-3.5 text-red-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button 
            onClick={() => setShowWidgets(!showWidgets)}
            className={`px-2 py-0.5 rounded border transition flex items-center space-x-1.5 ${
              showWidgets ? 'bg-red-950/50 border-red-500/40 text-red-300' : 'bg-white/5 border-white/10 text-white/60'
            }`}
          >
            <Grid className="w-3 h-3" />
            <span>Widgets {showWidgets ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div className="flex items-center space-x-4 font-mono">
          <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-950/40 px-2.5 py-0.5 rounded border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Firestore Live</span>
          </div>

          <button 
            onClick={() => setShowControlCenter(!showControlCenter)}
            className="flex items-center space-x-2 text-white/80 hover:text-white transition"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          <div className="text-white/90 font-semibold tracking-wide">
            {currentDate} {currentTime}
          </div>

          <button 
            onClick={toggleFullscreen}
            className="p-1 text-white/60 hover:text-red-400 transition flex items-center space-x-1"
            title={isFullscreen ? "Exit Fullscreen Mode" : "Enter Fullscreen Mode"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button 
            onClick={() => setIsLocked(true)}
            className="p-1 text-white/60 hover:text-red-400 transition"
            title="Lock OS"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. DESKTOP GRID & WIDGETS AREA */}
      <div className="absolute top-9 bottom-12 left-0 right-0 p-6 flex flex-wrap content-start items-start gap-6 z-0 overflow-y-auto">
        {/* Desktop App Icons */}
        {DESKTOP_APPS.map(app => {
          const IconComponent = app.icon;
          return (
            <button
              key={app.key}
              onDoubleClick={() => openApp(app.key)}
              onClick={() => openApp(app.key)}
              className="w-24 h-24 rounded-2xl p-2.5 flex flex-col items-center justify-center space-y-2 hover:bg-white/10 border border-transparent hover:border-white/15 transition group cursor-pointer"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition`}>
                <IconComponent className="w-6 h-6 text-white" />
              </div>
              <span className="text-[11px] font-medium text-white/90 text-center leading-tight line-clamp-2 drop-shadow-md">
                {app.title}
              </span>
            </button>
          );
        })}

        {/* Floating Desktop Widgets Sidebar */}
        {showWidgets && (
          <div className="ml-auto w-80 space-y-4 pointer-events-auto">
            {/* Widget 1: Local Clock */}
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl">
              <div className="text-xs text-red-400 font-mono uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Shop Clock ({currentTenantId})</span>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              </div>
              <div className="text-3xl font-bold font-mono tracking-tight text-white">
                {currentTime || '12:00:00 PM'}
              </div>
              <div className="text-xs text-white/60 mt-1 font-medium">{currentDate}</div>
            </div>

            {/* Widget 2: Attendance Quick Summary */}
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-emerald-400 tracking-wider">Attendance Telemetry</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-white font-mono">14</span>
                <span className="text-xs text-white/60">Technicians Clocked In</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-500 h-full w-[85%]"></div>
              </div>
            </div>

            {/* Widget 3: Yellow Sheets Status */}
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-amber-400 tracking-wider">Yellow Sheets Queue</span>
                <FileText className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-bold text-white font-mono">3</span>
                  <span className="text-xs text-white/60 ml-2">Active Staged</span>
                </div>
                <button 
                  onClick={() => openApp('yellow_sheets')} 
                  className="text-xs text-amber-400 hover:underline font-mono"
                >
                  View All &rarr;
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. WINDOWS LAYER */}
      {openWindows.map(win => {
        if (win.isMinimized) return null;
        const IconComp = win.icon;
        const isActive = activeWindowId === win.id;

        return (
          <div
            key={win.id}
            onClick={() => focusWindow(win.id)}
            style={{
              zIndex: win.zIndex,
              left: win.isMaximized ? 0 : win.x,
              top: win.isMaximized ? 36 : win.y,
              width: win.isMaximized ? '100vw' : win.width,
              height: win.isMaximized ? 'calc(100vh - 84px)' : win.height,
            }}
            className={`absolute flex flex-col rounded-xl overflow-hidden shadow-2xl transition-shadow ${
              isActive ? 'ring-1 ring-red-500/60 shadow-red-950/50' : 'opacity-95'
            } bg-neutral-900/95 backdrop-blur-2xl border border-white/15`}
          >
            {/* Window Header Bar */}
            <div className="h-10 bg-black/80 border-b border-white/10 px-4 flex items-center justify-between cursor-move select-none">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}
                    className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-black font-bold text-[9px] group"
                  >
                    <X className="w-2 h-2 opacity-0 group-hover:opacity-100" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleMinimize(win.id); }}
                    className="w-3 h-3 rounded-full bg-amber-500 hover:bg-amber-600 flex items-center justify-center text-black font-bold text-[9px] group"
                  >
                    <Minimize2 className="w-2 h-2 opacity-0 group-hover:opacity-100" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
                    className="w-3 h-3 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-black font-bold text-[9px] group"
                  >
                    <Maximize2 className="w-2 h-2 opacity-0 group-hover:opacity-100" />
                  </button>
                </div>
                <span className="text-white/30">|</span>
                <IconComp className="w-4 h-4 text-red-400" />
                <span className="text-xs font-semibold text-white/90">{win.title}</span>
              </div>

              <div className="text-[10px] font-mono text-white/40 uppercase">
                Upfitters Window [{currentTenantId}]
              </div>
            </div>

            {/* Window Content Container */}
            <div className="flex-1 overflow-auto bg-neutral-950 p-4 text-white">
              {win.appKey === 'staff_roster' && <StaffRoster tenantId={currentTenantId} />}
              {win.appKey === 'yellow_sheets' && <YellowSheets tenantId={currentTenantId} />}
              {win.appKey === 'timeclock' && <TimeclockSpreadsheet tenantId={currentTenantId} />}
              {win.appKey === 'bay_monitor' && <BayMonitor tenantId={currentTenantId} />}
              {win.appKey === 'settings' && <BusinessSettings tenantId={currentTenantId} />}
              {win.appKey === 'quickdesk' && <QuickDesk tenantId={currentTenantId} />}
              {win.appKey === 'overview' && <OverviewV3 tenantId={currentTenantId} />}

              {/* Terminal App */}
              {win.appKey === 'terminal' && (
                <div className="font-mono text-xs space-y-3 h-full flex flex-col justify-between p-2">
                  <div className="space-y-2 overflow-y-auto max-h-[360px]">
                    {terminalHistory.map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="text-red-400 flex items-center space-x-2">
                          <span>upfitters@os:~$</span>
                          <span className="text-white">{item.cmd}</span>
                        </div>
                        <div className="text-white/70 whitespace-pre-wrap pl-4">{item.output}</div>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleTerminalSubmit} className="flex items-center space-x-2 border-t border-white/10 pt-2">
                    <span className="text-red-500 font-bold">&gt;</span>
                    <input 
                      type="text"
                      value={terminalInput}
                      onChange={(e) => setTerminalInput(e.target.value)}
                      placeholder="Type command ('help', 'staff', 'bays', 'yellowsheets')..."
                      className="flex-1 bg-transparent text-white outline-none text-xs font-mono"
                    />
                  </form>
                </div>
              )}

              {/* Notes App */}
              {win.appKey === 'notes' && (
                <div className="h-full flex flex-col p-1">
                  <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center justify-between">
                    <span>Shop Notepad ({currentTenantId})</span>
                    <span className="text-[10px] text-white/40">Auto-saved</span>
                  </div>
                  <textarea
                    value={notesText}
                    onChange={(e) => {
                      setNotesText(e.target.value);
                      localStorage.setItem(`upfitters_os_notes_${currentTenantId}`, e.target.value);
                    }}
                    placeholder="Write shop reminders, part numbers, or shift handovers here..."
                    className="flex-1 w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-amber-100 font-mono outline-none focus:border-amber-500/50 transition resize-none"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* 4. START MENU MODAL */}
      {showStartMenu && (
        <div className="absolute top-11 left-4 w-96 bg-black/90 backdrop-blur-2xl border border-white/15 rounded-2xl p-4 shadow-2xl z-50 space-y-4">
          <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-white/50" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shop apps..."
              className="bg-transparent text-xs text-white outline-none w-full"
            />
          </div>

          <div className="space-y-1 max-h-80 overflow-y-auto">
            <div className="text-[10px] font-mono text-white/40 uppercase px-2 mb-1">Applications</div>
            {filteredApps.map(app => {
              const AppIcon = app.icon;
              return (
                <button
                  key={app.key}
                  onClick={() => openApp(app.key)}
                  className="w-full flex items-center space-x-3 p-2 rounded-xl hover:bg-white/10 transition text-left group"
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${app.color} flex items-center justify-center`}>
                    <AppIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-white group-hover:text-red-400 transition">{app.title}</div>
                    <div className="text-[10px] text-white/50">{app.category}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. CONTROL CENTER MODAL */}
      {showControlCenter && (
        <div className="absolute top-11 right-4 w-80 bg-black/90 backdrop-blur-2xl border border-white/15 rounded-2xl p-4 shadow-2xl z-50 space-y-4">
          <div className="text-xs font-semibold text-white/80 uppercase tracking-wider">OS Preferences</div>
          
          <div className="space-y-2">
            <div className="text-xs text-white/60">Desktop Wallpaper</div>
            <div className="grid grid-cols-2 gap-2">
              {(['carbon', 'asphalt', 'crimson', 'slate'] as WallpaperPreset[]).map(wp => (
                <button
                  key={wp}
                  onClick={() => setWallpaper(wp)}
                  className={`p-2 rounded-lg border text-xs font-capitalize transition ${
                    wallpaper === wp ? 'border-red-500 bg-red-950/40 text-red-300' : 'border-white/10 bg-white/5 text-white/70'
                  }`}
                >
                  {wp}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. BOTTOM TASKBAR / DOCK */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/80 backdrop-blur-2xl border-t border-white/10 px-4 flex items-center justify-between z-40">
        <button 
          onClick={() => setShowStartMenu(!showStartMenu)}
          className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg transition"
        >
          <Grid className="w-4 h-4" />
          <span>Apps</span>
        </button>

        {/* Dock Running Windows */}
        <div className="flex items-center space-x-2 overflow-x-auto max-w-xl">
          {openWindows.map(win => {
            const AppIcon = win.icon;
            const isActive = activeWindowId === win.id && !win.isMinimized;
            return (
              <button
                key={win.id}
                onClick={() => focusWindow(win.id)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs border transition ${
                  isActive ? 'bg-white/15 border-red-500/60 text-white font-semibold' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                }`}
              >
                <AppIcon className="w-3.5 h-3.5 text-red-400" />
                <span className="truncate max-w-[120px]">{win.title}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-3 text-xs text-white/60 font-mono">
          <span>Upfitters OS [{currentTenantId}]</span>
        </div>
      </div>

      {/* 7. LOCK SCREEN OVERLAY */}
      {isLocked && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl z-50 flex flex-col items-center justify-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 shadow-2xl">
            <Lock className="w-8 h-8" />
          </div>
          <div className="text-center space-y-1">
            <div className="text-xl font-bold text-white uppercase tracking-wider">Upfitters OS Locked</div>
            <div className="text-xs text-white/50">Click unlock to resume shop terminal session for {currentTenantId}</div>
          </div>
          <button
            onClick={() => setIsLocked(false)}
            className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs uppercase tracking-wider shadow-lg transition"
          >
            Unlock Session
          </button>
        </div>
      )}
    </div>
  );
}

export default UpfittersDesktopOS;
