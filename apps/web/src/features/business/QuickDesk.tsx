import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, query, onSnapshot, orderBy, where
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Monitor, Briefcase, Users, CheckSquare, Clock, Activity, 
  X, Minimize2, Maximize2, RefreshCw, 
  Terminal, FileText, 
  Volume2, VolumeX, LayoutGrid
} from 'lucide-react';
import { 
  WorkflowChart, LedgerSheet, CommandConsole, JobsLedgerApp, 
  CustomerCRMApp, TodoManagerApp, TimeclockApp, SyncMonitorApp 
} from './QuickDeskApps';

// Type definitions for the Windowing System
interface DesktopWindow {
  id: string;
  title: string;
  icon: React.ElementType;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export function QuickDesk({ tenantId }: { tenantId: string }) {

  // Desktop States
  const [windows, setWindows] = useState<DesktopWindow[]>([]);
  const [maxZIndex, setMaxZIndex] = useState(10);
  const [wallpaper, setWallpaper] = useState<'grid' | 'midnight' | 'aurora' | 'carbon'>('grid');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const desktopRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    playSound('click');
    if (!desktopRef.current) return;
    
    if (!document.fullscreenElement) {
      desktopRef.current.requestFullscreen().catch(err => {
        toast.error(`Error enabling full screen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Firestore Live Data
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [syncQueue, setSyncQueue] = useState<any[]>([]);

  // Sound Engine using Web Audio API (No asset dependencies!)
  const playSound = (type: 'click' | 'open' | 'save' | 'minimize') => {
    if (typeof window === 'undefined' || !soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      
      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'open') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'minimize') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(780, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'save') {
        const playTone = (freq: number, start: number, duration: number) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, start);
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.035, start);
          g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          o.start(start);
          o.stop(start + duration);
        };
        playTone(523.25, now, 0.35); // C5
        playTone(659.25, now + 0.04, 0.35); // E5
        playTone(783.99, now + 0.08, 0.45); // G5
        playTone(1046.5, now + 0.12, 0.55); // C6
      }
    } catch (e) {
      console.error('AudioContext synthesis failed:', e);
    }
  };

  // Define default app configurations
  const APPS = useMemo(() => [
    { id: 'workflow', title: 'Interactive Flowchart', icon: LayoutGrid, width: 720, height: 420 },
    { id: 'ledger', title: 'Quick Entry Ledger', icon: FileText, width: 850, height: 480 },
    { id: 'console', title: 'Command Console', icon: Terminal, width: 600, height: 380 },
    { id: 'jobs', title: 'Jobs Ledger', icon: Briefcase, width: 800, height: 460 },
    { id: 'customers', title: 'Customer CRM', icon: Users, width: 780, height: 460 },
    { id: 'todos', title: 'Todo Manager', icon: CheckSquare, width: 680, height: 480 },
    { id: 'timeclock', title: 'Timeclock Monitor', icon: Clock, width: 600, height: 420 },
    { id: 'sync', title: 'QuickBooks Sync Monitor', icon: RefreshCw, width: 720, height: 450 }
  ], []);

  // Initialize Desktop State & Subscriptions
  useEffect(() => {
    if (!tenantId) return;

    // Load initial windows (Jobs Ledger is open by default as the dashboard)
    const initialWindows = APPS.map((app, idx) => ({
      ...app,
      isOpen: app.id === 'jobs',
      isMinimized: false,
      isMaximized: false,
      x: 60 + idx * 25,
      y: 40 + idx * 20,
      zIndex: app.id === 'jobs' ? 12 : 10
    }));
    setWindows(initialWindows);

    // 1. Subscribe to Jobs
    const qJobs = query(collection(db, `businesses/${tenantId}/jobs`), orderBy('updatedAt', 'desc'));
    const unsubJobs = onSnapshot(qJobs, (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Subscribe to Customers
    const qCust = query(collection(db, `businesses/${tenantId}/customers`), orderBy('name', 'asc'));
    const unsubCust = onSnapshot(qCust, (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Subscribe to Staff
    const qStaff = query(collection(db, `businesses/${tenantId}/staff`));
    const unsubStaff = onSnapshot(qStaff, (snap) => {
      setStaff(snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(s => !s.isArchived && !s.fireDate && s.departmentId));
    });

    // 4. Subscribe to Todos
    const qTodos = query(collection(db, `businesses/${tenantId}/todos`), orderBy('createdAt', 'desc'));
    const unsubTodos = onSnapshot(qTodos, (snap) => {
      setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 5. Subscribe to Active Time Sessions
    const qSessions = query(collection(db, `businesses/${tenantId}/time_sessions`), where('status', '==', 'active'));
    const unsubSessions = onSnapshot(qSessions, (snap) => {
      setActiveSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 6. Subscribe to QuickBooks Sync Queue (sorted in-memory to avoid composite index requirement)
    const qSync = query(collection(db, 'qbwc_queue'), where('tenantId', '==', tenantId));
    const unsubSync = onSnapshot(qSync, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      items.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return dateB - dateA;
      });
      setSyncQueue(items);
    });

    return () => {
      unsubJobs();
      unsubCust();
      unsubStaff();
      unsubTodos();
      unsubSessions();
      unsubSync();
    };
  }, [tenantId, APPS]);

  // Window Management Actions
  const openWindow = (id: string) => {
    playSound('open');
    setWindows(prev => prev.map(w => {
      if (w.id === id) {
        const nextZ = maxZIndex + 1;
        setMaxZIndex(nextZ);
        return { ...w, isOpen: true, isMinimized: false, zIndex: nextZ };
      }
      return w;
    }));
  };

  const closeWindow = (id: string) => {
    playSound('click');
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isOpen: false } : w));
  };

  const minimizeWindow = (id: string) => {
    playSound('minimize');
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: true } : w));
  };

  const maximizeWindow = (id: string) => {
    playSound('click');
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isMaximized: !w.isMaximized } : w));
  };

  const focusWindow = (id: string) => {
    setWindows(prev => {
      const target = prev.find(w => w.id === id);
      if (target && target.zIndex < maxZIndex) {
        playSound('click');
        const nextZ = maxZIndex + 1;
        setMaxZIndex(nextZ);
        return prev.map(w => w.id === id ? { ...w, isMinimized: false, zIndex: nextZ } : w);
      }
      return prev.map(w => w.id === id ? { ...w, isMinimized: false } : w);
    });
  };

  const cascadeWindows = () => {
    playSound('click');
    setWindows(prev => prev.map((w, idx) => {
      const nextZ = maxZIndex + idx + 1;
      return {
        ...w,
        isMinimized: false,
        isMaximized: false,
        x: 60 + idx * 30,
        y: 60 + idx * 25,
        zIndex: nextZ
      };
    }));
    setMaxZIndex(prev => prev + windows.length + 2);
  };

  const minimizeAll = () => {
    playSound('minimize');
    setWindows(prev => prev.map(w => ({ ...w, isMinimized: true })));
  };

  const closeAll = () => {
    playSound('click');
    setWindows(prev => prev.map(w => ({ ...w, isOpen: false })));
  };

  // DOM-First smooth window dragging
  const startDragging = (e: React.PointerEvent<HTMLDivElement>, windowId: string) => {
    if (e.button !== 0) return;
    
    const targetWin = windows.find(w => w.id === windowId);
    if (!targetWin || targetWin.isMaximized) return;

    focusWindow(windowId);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = targetWin.x;
    const initialY = targetWin.y;

    let currentX = initialX;
    let currentY = initialY;

    const el = document.getElementById(`win-${windowId}`);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      currentX = initialX + dx;
      currentY = initialY + dy;

      if (el) {
        el.style.left = `${currentX}px`;
        el.style.top = `${currentY}px`;
      }
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      setWindows(prev => prev.map(w => {
        if (w.id === windowId) {
          return { ...w, x: currentX, y: currentY };
        }
        return w;
      }));
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  // DOM-First smooth window resizing
  const startResizing = (e: React.PointerEvent<HTMLDivElement>, windowId: string) => {
    if (e.button !== 0) return;

    const targetWin = windows.find(w => w.id === windowId);
    if (!targetWin || targetWin.isMaximized) return;

    focusWindow(windowId);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialWidth = targetWin.width;
    const initialHeight = targetWin.height;

    let currentWidth = initialWidth;
    let currentHeight = initialHeight;

    const el = document.getElementById(`win-${windowId}`);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      currentWidth = Math.max(400, initialWidth + dx);
      currentHeight = Math.max(300, initialHeight + dy);

      if (el) {
        el.style.width = `${currentWidth}px`;
        el.style.height = `${currentHeight}px`;
      }
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      setWindows(prev => prev.map(w => {
        if (w.id === windowId) {
          return { ...w, width: currentWidth, height: currentHeight };
        }
        return w;
      }));
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const handleDeskClick = () => {
    if (isStartMenuOpen) {
      setIsStartMenuOpen(false);
    }
  };

  return (
    <div 
      ref={desktopRef}
      onClick={handleDeskClick}
      className={`relative flex flex-col font-sans select-none transition-all overflow-hidden ${
        isFullscreen 
          ? 'w-screen h-screen rounded-none border-none bg-zinc-950' 
          : 'w-full h-[82vh] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl'
      } ${
        wallpaper === 'midnight' ? 'bg-zinc-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-zinc-950 to-zinc-950' :
        wallpaper === 'aurora' ? 'bg-zinc-950 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-indigo-950 via-slate-900 to-zinc-950' :
        wallpaper === 'carbon' ? 'bg-zinc-900 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800 via-zinc-950 to-zinc-950' :
        'bg-zinc-50 dark:bg-zinc-955 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]'
      }`}
    >
      {/* ----------------------------------------------------
          TOP DESKTOP MENUBAR
      ---------------------------------------------------- */}
      <div className="h-9 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-4 z-40 shrink-0 select-none">
        <div className="flex items-center gap-6 text-xs font-semibold text-zinc-650 dark:text-zinc-400">
          <div className="flex items-center gap-1.5 text-zinc-900 dark:text-white font-black">
            <Monitor className="w-4 h-4 text-indigo-500" />
            <span>QuickDesk</span>
          </div>

          {/* Menus Dropdown */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <button className="hover:text-zinc-900 dark:hover:text-white py-1">Lists</button>
              <div className="absolute left-0 mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 hidden group-hover:block z-50 text-left font-bold">
                <button onClick={() => openWindow('customers')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Customer List
                </button>
                <button onClick={() => openWindow('jobs')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" /> Job Index
                </button>
                <button onClick={() => openWindow('todos')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
                  <CheckSquare className="w-3.5 h-3.5" /> Shop Todos
                </button>
              </div>
            </div>

            <div className="relative group">
              <button className="hover:text-zinc-900 dark:hover:text-white py-1">Activities</button>
              <div className="absolute left-0 mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 hidden group-hover:block z-50 text-left font-bold">
                <button onClick={() => openWindow('ledger')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> ledger sheet
                </button>
                <button onClick={() => openWindow('console')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" /> Command Console
                </button>
                <button onClick={() => openWindow('timeclock')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" /> Timeclock Monitor
                </button>
              </div>
            </div>

            <div className="relative group">
              <button className="hover:text-zinc-900 dark:hover:text-white py-1">Window</button>
              <div className="absolute left-0 mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 hidden group-hover:block z-50 text-left font-bold">
                <button onClick={cascadeWindows} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5" /> Cascade Windows
                </button>
                <button onClick={minimizeAll} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 flex items-center gap-2">
                  <Minimize2 className="w-3.5 h-3.5" /> Minimize All
                </button>
                <button onClick={closeAll} className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 flex items-center gap-2">
                  <X className="w-3.5 h-3.5 text-rose-500" /> Close All
                </button>
              </div>
            </div>

            <div className="relative group">
              <button className="hover:text-zinc-900 dark:hover:text-white py-1">Theme</button>
              <div className="absolute left-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 hidden group-hover:block z-50 text-left font-bold">
                <div className="px-3 py-1 text-[10px] text-zinc-400 uppercase tracking-wider">Wallpapers</div>
                <button onClick={() => setWallpaper('grid')} className={`w-full text-left px-4 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 ${wallpaper === 'grid' ? 'text-indigo-500' : ''}`}>Classic Grid</button>
                <button onClick={() => setWallpaper('midnight')} className={`w-full text-left px-4 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 ${wallpaper === 'midnight' ? 'text-indigo-500' : ''}`}>Midnight Blue</button>
                <button onClick={() => setWallpaper('aurora')} className={`w-full text-left px-4 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 ${wallpaper === 'aurora' ? 'text-indigo-500' : ''}`}>Aurora Indigo</button>
                <button onClick={() => setWallpaper('carbon')} className={`w-full text-left px-4 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 ${wallpaper === 'carbon' ? 'text-indigo-500' : ''}`}>Deep Carbon</button>
              </div>
            </div>
          </div>
        </div>

        {/* Global Toolbar actions */}
        <div className="flex items-center gap-3">
          {/* Full Screen Toggler */}
          <button 
            onClick={toggleFullscreen}
            className="p-1 text-zinc-450 hover:text-zinc-800 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95"
            title={isFullscreen ? "Exit full screen" : "Enter full screen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4 text-zinc-450" />}
          </button>

          {/* Sounds toggler */}
          <button 
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              playSound('click');
            }}
            className="p-1 text-zinc-450 hover:text-zinc-800 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95"
            title="Toggle retro synth feedback audio"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* QuickBooks connection badge */}
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/60 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
            <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">QB Connected</span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------
          DESKTOP CANVAS & WALLPAPER ICON SHORTCUTS
      ---------------------------------------------------- */}
      <div 
        onClick={handleDeskClick}
        className="flex-1 relative p-6 overflow-hidden select-none"
      >
        {/* Desktop shortcuts container */}
        <div className="grid grid-flow-row gap-6 w-20 justify-items-center select-none z-10 relative">
          {/* 1. Workflow Shortcut */}
          <div 
            onClick={() => openWindow('workflow')}
            className="flex flex-col items-center gap-1.5 cursor-pointer group w-20"
          >
            <div className="w-12 h-12 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-white/20 dark:border-zinc-800/80 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 active:scale-95 transition-all text-indigo-500 group-hover:shadow-indigo-500/10">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <span className="text-[9px] font-black text-center truncate w-full text-zinc-800 dark:text-zinc-200 drop-shadow-sm select-none">Flowchart</span>
          </div>

          {/* 2. Ledger Shortcut */}
          <div 
            onClick={() => openWindow('ledger')}
            className="flex flex-col items-center gap-1.5 cursor-pointer group w-20"
          >
            <div className="w-12 h-12 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-white/20 dark:border-zinc-800/80 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 active:scale-95 transition-all text-amber-500 group-hover:shadow-amber-500/10">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-[9px] font-black text-center truncate w-full text-zinc-800 dark:text-zinc-200 drop-shadow-sm select-none">Ledger sheet</span>
          </div>

          {/* 2.5. Jobs Ledger Shortcut */}
          <div 
            onClick={() => openWindow('jobs')}
            className="flex flex-col items-center gap-1.5 cursor-pointer group w-20"
          >
            <div className="w-12 h-12 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-white/20 dark:border-zinc-800/80 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 active:scale-95 transition-all text-violet-500 group-hover:shadow-violet-500/10">
              <Briefcase className="w-6 h-6" />
            </div>
            <span className="text-[9px] font-black text-center truncate w-full text-zinc-800 dark:text-zinc-200 drop-shadow-sm select-none">Jobs Ledger</span>
          </div>

          {/* 3. CLI Console Shortcut */}
          <div 
            onClick={() => openWindow('console')}
            className="flex flex-col items-center gap-1.5 cursor-pointer group w-20"
          >
            <div className="w-12 h-12 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-white/20 dark:border-zinc-800/80 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 active:scale-95 transition-all text-emerald-500 group-hover:shadow-emerald-500/10">
              <Terminal className="w-6 h-6" />
            </div>
            <span className="text-[9px] font-black text-center truncate w-full text-zinc-800 dark:text-zinc-200 drop-shadow-sm select-none">Terminal</span>
          </div>

          {/* 4. Sync Center Shortcut */}
          <div 
            onClick={() => openWindow('sync')}
            className="flex flex-col items-center gap-1.5 cursor-pointer group w-20"
          >
            <div className="w-12 h-12 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-white/20 dark:border-zinc-800/80 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 active:scale-95 transition-all text-blue-500 group-hover:shadow-blue-500/10">
              <RefreshCw className="w-6 h-6" />
            </div>
            <span className="text-[9px] font-black text-center truncate w-full text-zinc-800 dark:text-zinc-200 drop-shadow-sm select-none">Sync Center</span>
          </div>
        </div>

        {/* ----------------------------------------------------
            VIRTUAL WINDOWS DRAGGABLE CONTAINERS
        ---------------------------------------------------- */}
        {windows.filter(w => w.isOpen && !w.isMinimized).map(w => (
          <div
            key={w.id}
            id={`win-${w.id}`}
            onPointerDown={() => focusWindow(w.id)}
            style={{ 
              zIndex: w.zIndex,
              left: w.isMaximized ? 0 : w.x,
              top: w.isMaximized ? 0 : w.y,
              width: w.isMaximized ? '100%' : w.width,
              height: w.isMaximized ? '100%' : w.height,
              position: 'absolute'
            }}
            className={`flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden min-w-[400px] min-h-[300px]`}
          >
            {/* Window title bar/Chrome header */}
            <div 
              onDoubleClick={() => maximizeWindow(w.id)}
              onPointerDown={(e) => startDragging(e, w.id)}
              className="h-9 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-between px-3 shrink-0 select-none cursor-move"
            >
              {/* Window Header Info */}
              <div className="flex-1 flex items-center gap-2 h-full text-zinc-800 dark:text-zinc-200 text-xs font-black select-none pointer-events-none">
                <w.icon className="w-4 h-4 text-indigo-500" />
                <span className="truncate">{w.title}</span>
              </div>

              {/* Actions controls */}
              <div className="flex items-center gap-1.5 shrink-0" onPointerDown={e => e.stopPropagation()}>
                {/* Minimize */}
                <button 
                  onClick={() => minimizeWindow(w.id)}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-550 transition-colors"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                {/* Maximize */}
                <button 
                  onClick={() => maximizeWindow(w.id)}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-550 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                {/* Close */}
                <button 
                  onClick={() => closeWindow(w.id)}
                  className="p-1 hover:bg-rose-100 dark:hover:bg-rose-955 rounded text-zinc-550 hover:text-rose-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Window Content Body */}
            <div 
              className="flex-1 overflow-auto bg-white dark:bg-zinc-950 no-scrollbar relative"
            >
              {w.id === 'workflow' && (
                <WorkflowChart 
                  customersCount={customers.length} 
                  jobsCount={jobs.length} 
                  openWindow={openWindow} 
                />
              )}
              {w.id === 'ledger' && (
                <LedgerSheet 
                  tenantId={tenantId} 
                  jobs={jobs} 
                  staff={staff} 
                  playSound={playSound} 
                />
              )}
              {w.id === 'console' && (
                <CommandConsole 
                  tenantId={tenantId} 
                  jobs={jobs} 
                  customers={customers} 
                  staff={staff} 
                  todos={todos} 
                  activeSessions={activeSessions} 
                  playSound={playSound} 
                  openWindow={openWindow} 
                />
              )}
              {w.id === 'jobs' && (
                <JobsLedgerApp 
                  tenantId={tenantId} 
                  jobs={jobs} 
                  customers={customers} 
                  playSound={playSound} 
                />
              )}
              {w.id === 'customers' && (
                <CustomerCRMApp 
                  tenantId={tenantId} 
                  customers={customers} 
                  playSound={playSound} 
                />
              )}
              {w.id === 'todos' && (
                <TodoManagerApp 
                  tenantId={tenantId} 
                  todos={todos} 
                  staff={staff} 
                  playSound={playSound} 
                />
              )}
              {w.id === 'timeclock' && (
                <TimeclockApp 
                  tenantId={tenantId} 
                  activeSessions={activeSessions} 
                  staff={staff} 
                  playSound={playSound} 
                />
              )}
              {w.id === 'sync' && (
                <SyncMonitorApp 
                  syncQueue={syncQueue} 
                />
              )}
            </div>

            {/* Bottom-right diagonal resize grabber */}
            {!w.isMaximized && (
              <div 
                className="absolute bottom-1 right-1 w-3.5 h-3.5 cursor-se-resize flex items-end justify-end pointer-events-auto z-30 opacity-40 hover:opacity-100 transition-opacity"
                onPointerDown={(e) => startResizing(e, w.id)}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" className="text-zinc-500 select-none pointer-events-none">
                  <line x1="6" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ----------------------------------------------------
          BOTTOM DESKTOP TASKBAR & START MENU
      ---------------------------------------------------- */}
      <div className="h-12 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md flex items-center justify-between px-4 z-40 shrink-0 select-none">
        
        {/* Start Button & Menu */}
        <div className="relative flex items-center gap-3">
          <button 
            onClick={() => {
              setIsStartMenuOpen(!isStartMenuOpen);
              playSound('click');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/25 transition-all active:scale-95 shrink-0"
          >
            <Monitor className="w-4 h-4" />
            Start Portal
          </button>

          {/* Start Menu dropdown */}
          <AnimatePresence>
            {isStartMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="absolute bottom-14 left-0 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl py-3 z-50 text-left font-sans"
              >
                <div className="px-4 pb-2 border-b border-zinc-150 dark:border-zinc-800 mb-2">
                  <div className="font-black text-xs text-zinc-900 dark:text-white">UpfittersOS Console</div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">Classic Windows portal</div>
                </div>

                <div className="space-y-0.5 px-2">
                  <button 
                    onClick={() => {
                      openWindow('ledger');
                      setIsStartMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-xl flex items-center gap-3 font-bold text-xs"
                  >
                    <div className="p-1.5 bg-amber-500 text-white rounded-lg"><FileText className="w-3.5 h-3.5" /></div>
                    Time entry ledger
                  </button>

                  <button 
                    onClick={() => {
                      openWindow('jobs');
                      setIsStartMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-xl flex items-center gap-3 font-bold text-xs"
                  >
                    <div className="p-1.5 bg-violet-500 text-white rounded-lg"><Briefcase className="w-3.5 h-3.5" /></div>
                    Active Job Orders
                  </button>

                  <button 
                    onClick={() => {
                      openWindow('customers');
                      setIsStartMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-xl flex items-center gap-3 font-bold text-xs"
                  >
                    <div className="p-1.5 bg-indigo-500 text-white rounded-lg"><Users className="w-3.5 h-3.5" /></div>
                    Customer CRM Accounts
                  </button>

                  <button 
                    onClick={() => {
                      openWindow('timeclock');
                      setIsStartMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-xl flex items-center gap-3 font-bold text-xs"
                  >
                    <div className="p-1.5 bg-emerald-500 text-white rounded-lg"><Clock className="w-3.5 h-3.5" /></div>
                    Live Timeclock Monitor
                  </button>

                  <button 
                    onClick={() => {
                      openWindow('sync');
                      setIsStartMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-xl flex items-center gap-3 font-bold text-xs"
                  >
                    <div className="p-1.5 bg-blue-500 text-white rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></div>
                    QuickBooks Web Connector
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Active app tabs in taskbar */}
          <div className="hidden md:flex items-center gap-1.5">
            {windows.filter(w => w.isOpen).map(w => (
              <button
                key={w.id}
                onClick={() => {
                  if (w.isMinimized) {
                    focusWindow(w.id);
                  } else {
                    minimizeWindow(w.id);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black transition-all ${
                  w.isMinimized 
                    ? 'bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-400 border-zinc-200 dark:border-zinc-850 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50' 
                    : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-900/50 shadow-sm'
                }`}
              >
                <w.icon className="w-3 h-3" />
                <span>{w.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Live system tray (clock & active personnel stats) */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Active Technicians Shift Count */}
          <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span>{activeSessions.length} On Shift</span>
          </div>

          {/* QuickBooks Queue light status */}
          <div className="flex items-center gap-1.5 text-[9px] font-black text-indigo-600 bg-indigo-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Synced</span>
          </div>

          {/* Live system Clock */}
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 px-3 py-1 rounded-xl text-[10px] font-black text-zinc-650 tracking-wider">
            {(() => {
              const [time, setTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
              useEffect(() => {
                const i = setInterval(() => {
                  setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                }, 10000);
                return () => clearInterval(i);
              }, []);
              return time;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
