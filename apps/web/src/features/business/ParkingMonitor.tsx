import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, limit, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Maximize, Minimize, AlertTriangle, 
  Settings, Sliders, Crosshair, LayoutGrid, Info
} from 'lucide-react';
import _QRCode from 'react-qr-code';
import { cn } from '../../lib/utils';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const QRCode = (_QRCode as any).default || _QRCode;

interface Zone {
  id: string;
  name: string;
  type: string;
  currentVehicleVin: string | null;
  currentJobId: string | null;
  lastAssignedAt?: any;
  updatedAt?: any;
  createdAt?: any;
  isArchived?: boolean;
  status?: string;
  blocker?: string;
  blockers?: any[];
}

const LiveIndicator = ({ isDisconnected }: { isDisconnected?: boolean }) => (
  <div className={cn(
    "flex items-center gap-2 3xl:gap-4 px-3 py-1.5 3xl:px-6 3xl:py-3 rounded-lg 3xl:rounded-2xl border relative overflow-hidden group transition-colors duration-500",
    isDisconnected ? "bg-red-950/30 border-red-900 shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse" : "bg-zinc-900/50 border-zinc-800"
  )}>
    <div className="relative">
      <div className={cn(
        "w-2 h-2 3xl:w-4 3xl:h-4 rounded-full z-10 transition-colors duration-500",
        isDisconnected 
          ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" 
          : "bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]"
      )}></div>
      {!isDisconnected && (
        <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20 scale-150"></div>
      )}
    </div>
    <span className={cn(
      "text-zinc-400 text-xs 2xl:text-sm 3xl:text-[24px] font-black uppercase tracking-widest leading-none transition-colors duration-500",
      isDisconnected && "text-red-400"
    )}>
      {isDisconnected ? "OFFLINE" : "LIVE sync"}
    </span>
  </div>
);

const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate();
    } catch (e) {}
  }
  if (val && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

export function ParkingMonitor({ tenantId }: { tenantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [businessName, setBusinessName] = useState('UPFITTERS OS');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reloadCountdown, setReloadCountdown] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  // Monitor viewport resize
  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Custom Calibration Settings Panel
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [monitorMode, setMonitorMode] = useState<'left' | 'right' | 'top' | 'bottom' | 'span' | 'custom'>(() => {
    return (localStorage.getItem('parking_monitor_mode') as any) || 'span';
  });
  const [customStart, setCustomStart] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_custom_start') || '1');
  });
  const [customEnd, setCustomEnd] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_custom_end') || '16');
  });
  const [cardWidth, setCardWidth] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_card_width') || '360');
  });
  const [cardHeight, setCardHeight] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_card_height') || '560');
  });
  const [headerHeight, setHeaderHeight] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_header_height') || '45'); // in percentage of card height
  });
  const [gridCols, setGridCols] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_cols') || '4');
  });
  const [gridRows, setGridRows] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_rows') || '4');
  });
  const [hookOffset, setHookOffset] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_hook_offset') || '25'); // in percentage from top
  });
  const [showCrosshairs, setShowCrosshairs] = useState<boolean>(() => {
    return localStorage.getItem('parking_monitor_crosshairs') === 'true';
  });
  const [alignmentMode, setAlignmentMode] = useState<boolean>(() => {
    return localStorage.getItem('parking_monitor_align_mode') === 'true';
  });
  const [fontScale, setFontScale] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_font_scale') || '1');
  });
  const [hideHeader, setHideHeader] = useState<boolean>(() => {
    return localStorage.getItem('parking_monitor_hide_header') === 'true';
  });
  const [gridGap, setGridGap] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_grid_gap') || '24');
  });
  const [pagePadding, setPagePadding] = useState<number>(() => {
    return Number(localStorage.getItem('parking_monitor_page_padding') || '24');
  });

  // Persist settings changes
  useEffect(() => {
    localStorage.setItem('parking_monitor_mode', monitorMode);
    localStorage.setItem('parking_monitor_cols', String(gridCols));
    localStorage.setItem('parking_monitor_rows', String(gridRows));
    localStorage.setItem('parking_monitor_hook_offset', String(hookOffset));
    localStorage.setItem('parking_monitor_crosshairs', String(showCrosshairs));
    localStorage.setItem('parking_monitor_align_mode', String(alignmentMode));
    localStorage.setItem('parking_monitor_font_scale', String(fontScale));
    localStorage.setItem('parking_monitor_custom_start', String(customStart));
    localStorage.setItem('parking_monitor_custom_end', String(customEnd));
    localStorage.setItem('parking_monitor_card_width', String(cardWidth));
    localStorage.setItem('parking_monitor_card_height', String(cardHeight));
    localStorage.setItem('parking_monitor_header_height', String(headerHeight));
    localStorage.setItem('parking_monitor_hide_header', String(hideHeader));
    localStorage.setItem('parking_monitor_grid_gap', String(gridGap));
    localStorage.setItem('parking_monitor_page_padding', String(pagePadding));
  }, [
    monitorMode, gridCols, gridRows, hookOffset, showCrosshairs, alignmentMode,
    fontScale, customStart, customEnd, cardWidth, cardHeight, headerHeight,
    hideHeader, gridGap, pagePadding
  ]);

  const applyPreset = (presetType: string) => {
    if (presetType === '15x15_4k') {
      setCardWidth(1200);
      setCardHeight(1200);
      setGridCols(3);
      setGridRows(1);
      setGridGap(40);
      setPagePadding(60);
      setFontScale(1.35);
      setHookOffset(25);
    } else if (presetType === '15x15_1080p') {
      setCardWidth(600);
      setCardHeight(600);
      setGridCols(3);
      setGridRows(1);
      setGridGap(20);
      setPagePadding(30);
      setFontScale(1.0);
      setHookOffset(25);
    } else if (presetType === '12x15_1080p') {
      setCardWidth(480);
      setCardHeight(600);
      setGridCols(3);
      setGridRows(1);
      setGridGap(24);
      setPagePadding(24);
      setFontScale(1.0);
      setHookOffset(25);
    }
  };

  // Firestore snapshot error callback
  const handleSnapshotError = (error: any, listenerName: string) => {
    console.error(`Firestore Snapshot Error in [${listenerName}]:`, error);
    setConnectionError(`Sync failure (${listenerName}). Recovering...`);
  };

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      window.location.reload();
    };
    const handleOffline = () => {
      setConnectionError("No network connection detected.");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync clock every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Periodic Auto-Reload (every 6 hours) to prevent memory leak and refresh auth session
  useEffect(() => {
    const reloadTimer = setTimeout(() => {
      console.log("Scheduled periodic auto-reload triggered...");
      window.location.reload();
    }, 6 * 60 * 60 * 1000); // 6 hours
    
    return () => clearTimeout(reloadTimer);
  }, []);

  // Handle recovery countdown when connection error exists
  useEffect(() => {
    if (!connectionError) {
      setReloadCountdown(null);
      return;
    }

    if (reloadCountdown === null) {
      setReloadCountdown(20);
      return;
    }

    const timer = setInterval(() => {
      setReloadCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timer);
          console.log("Connection recovery failed, reloading page...");
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionError, reloadCountdown]);

  // Fetch Business Profile
  useEffect(() => {
    if (!tenantId) return;
    getDoc(doc(db, 'businesses', tenantId)).then(snap => {
      if (snap.exists()) setBusinessName(snap.data().name || 'UPFITTERS OS');
    });
  }, [tenantId]);

  // Real-time listen to active sessions
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('status', 'in', ['active', 'on_break'])
    );
    const unsub = onSnapshot(q, (snap) => {
      setActiveSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleSnapshotError(err, 'Active Sessions');
    });
    return () => unsub();
  }, [tenantId]);

  // Real-time listen to zones (Parking and Lot types)
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/zones`));
    const unsub = onSnapshot(q, (snap) => {
      const data: Zone[] = [];
      snap.forEach(doc => {
        const val = doc.data() as Zone;
        if (!val.isArchived && (val.type === 'parking' || val.type === 'lot')) {
          data.push({ ...val, id: doc.id });
        }
      });
      // Naturally sort parking spots numerically/alphabetically (e.g. "Spot 2" before "Spot 10")
      data.sort((a, b) => 
        (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      setZones(data);
      setLastUpdated(new Date());
    }, (err) => {
      handleSnapshotError(err, 'Parking Spots Sync');
    });
    return () => unsub();
  }, [tenantId]);

  // Real-time listen to jobs
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/jobs`),
      where('status', 'not-in', ['Completed', 'Delivered'])
    );
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => {
      handleSnapshotError(err, 'Jobs Sync');
    });
    return () => unsub();
  }, [tenantId]);

  // Real-time listen to vehicles database
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/vehicles`), limit(1000));
    const unsub = onSnapshot(q, (snap) => {
      const data: any[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setVehicles(data);
      setLastUpdated(new Date());
    }, (err) => {
      handleSnapshotError(err, 'Vehicles Sync');
    });
    return () => unsub();
  }, [tenantId]);

  // Real-time listen to parts requests
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('status', 'in', ['pending', 'ordered', 'received'])
    );
    const unsub = onSnapshot(q, (snap) => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleSnapshotError(err, 'Parts Sync');
    });
    return () => unsub();
  }, [tenantId]);

  // Dual monitor split filtering logic
  const visibleZones = useMemo(() => {
    if (zones.length === 0) return [];
    
    if (monitorMode === 'left' || monitorMode === 'top') {
      const half = Math.ceil(zones.length / 2);
      return zones.slice(0, half);
    } else if (monitorMode === 'right' || monitorMode === 'bottom') {
      const half = Math.ceil(zones.length / 2);
      return zones.slice(half);
    } else if (monitorMode === 'custom') {
      const start = Math.max(1, Math.min(customStart, zones.length));
      const end = Math.max(start, Math.min(customEnd, zones.length));
      return zones.slice(start - 1, end);
    }
    return zones; // span Mode displays all
  }, [zones, monitorMode, customStart, customEnd]);

  // Pad the grid to match the columns x rows matrix so layout is symmetrical
  const displayGridSpots = useMemo(() => {
    const totalMatrixCells = gridCols * gridRows;
    const finalSpots = [...visibleZones];
    
    // Fill empty cells with placeholders to preserve grid dimensions and physical hook spacing
    if (finalSpots.length < totalMatrixCells) {
      const needed = totalMatrixCells - finalSpots.length;
      for (let i = 0; i < needed; i++) {
        finalSpots.push({
          id: `placeholder-${i}`,
          name: `EMPTY SLOT ${visibleZones.length + i + 1}`,
          type: 'placeholder',
          currentVehicleVin: null,
          currentJobId: null
        });
      }
    }
    
    return finalSpots.slice(0, totalMatrixCells);
  }, [visibleZones, gridCols, gridRows]);

  // Keep track of PWA auto-fullscreen restorer gestures
  useEffect(() => {
    const attemptAutoFullscreen = () => {
      const preference = localStorage.getItem('parkingMonitorFullscreenPreference');
      if (preference === 'true' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    const handleFirstInteraction = () => {
      const preference = localStorage.getItem('parkingMonitorFullscreenPreference');
      if (preference === 'true' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    
    attemptAutoFullscreen();

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
      localStorage.setItem('parkingMonitorFullscreenPreference', 'true');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
      localStorage.removeItem('parkingMonitorFullscreenPreference');
    }
  };

  const renderSpotCard = (spot: Zone) => {
    const isPlaceholder = spot.type === 'placeholder';
    const vehicle = vehicles.find((v: any) => v.vin === spot.currentVehicleVin);
    const job = jobs.find((j: any) => j.id === spot.currentJobId);
    const hasVehicle = !isPlaceholder && !!spot.currentVehicleVin;

    // Crew logged onto this job
    const activeStaff = activeSessions.filter((session: any) => {
      const jobsArr = Array.isArray(session.jobs) ? session.jobs : [];
      return jobsArr.some((j: any) => j && !j.end && j.id === job?.id);
    });

    // Blockers & alert statuses
    const target = job || spot;
    const legacyBlocker = target?.blocker ? [{ message: target.blocker, status: 'active' }] : [];
    const blockersArr = Array.isArray(target?.blockers) ? target.blockers : [];
    const activeBlockers = (blockersArr.length > 0 ? blockersArr : legacyBlocker).filter((b: any) => b && b.status === 'active');
    const isBlocked = !isPlaceholder && (activeBlockers.length > 0 || target?.status === 'Blocked' || job?.status === 'Blocked' || spot?.status === 'Blocked');

    // Parts details
    const relevantParts = partsRequests.filter((pr: any) => {
      if (!pr) return false;
      const prStatus = (pr.status || '').toLowerCase();
      const isActive = ['pending', 'received', 'ordered'].includes(prStatus);
      if (!isActive) return false;
      return job?.id && pr.jobId === job.id;
    });

    const isPartsMissing = relevantParts.some(pr => pr && (pr.status || '').toLowerCase() === 'pending');
    const isPartsReceived = relevantParts.some(pr => pr && (pr.status || '').toLowerCase() === 'received');
    const hasParts = relevantParts.length > 0;

    // Time calculations
    const timeInSpot = () => {
      const timestamp = spot.lastAssignedAt || spot.updatedAt || spot.createdAt;
      if (!timestamp) return null;
      let date = parseSafeDate(timestamp);
      if (!date || isNaN(date.getTime())) return null;
      const diff = Math.floor((now - date.getTime()) / 1000);
      if (diff < 0) return 'Just now';
      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    const spotDuration = timeInSpot();

    // Determine colors/shadows for cyberpunk dark-glass mode
    let themeColorClass = "border-zinc-800 text-zinc-500 bg-zinc-950/20";
    let glowStyle: React.CSSProperties = {};
    let ringNeonClass = "border-zinc-700 bg-zinc-900/60";

    if (!isPlaceholder && hasVehicle) {
      if (isBlocked) {
        themeColorClass = "border-red-500/80 bg-red-950/20";
        glowStyle = { boxShadow: "0 0 25px rgba(239, 68, 68, 0.25)" };
        ringNeonClass = "border-red-500 animate-pulse bg-red-500/10";
      } else if (isPartsMissing) {
        themeColorClass = "border-amber-500/80 bg-amber-950/20";
        glowStyle = { boxShadow: "0 0 25px rgba(245, 158, 11, 0.25)" };
        ringNeonClass = "border-amber-500 bg-amber-500/10";
      } else if (isPartsReceived || job?.status === 'Ready for QC') {
        themeColorClass = "border-emerald-500/80 bg-emerald-950/20";
        glowStyle = { boxShadow: "0 0 25px rgba(16, 185, 129, 0.25)" };
        ringNeonClass = "border-emerald-500 animate-pulse bg-emerald-500/10";
      } else {
        themeColorClass = "border-blue-500/80 bg-blue-950/20";
        glowStyle = { boxShadow: "0 0 25px rgba(59, 130, 246, 0.25)" };
        ringNeonClass = "border-blue-500 bg-blue-500/10";
      }
    }

    const cardVariants = {
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.96 }
    };

    const qrUrl = `${window.location.origin}/business/${tenantId}/job/${job?.id || ''}`;

    return (
      <motion.div
        key={spot.id}
        variants={cardVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={cn(
          "relative rounded-[2rem] border-2 backdrop-blur-md p-4 flex flex-col justify-between overflow-hidden group select-none transition-all duration-700 place-self-center shadow-lg",
          themeColorClass
        )}
        style={{
          ...glowStyle,
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
          minWidth: `${cardWidth}px`,
          maxWidth: `${cardWidth}px`,
          minHeight: `${cardHeight}px`,
          maxHeight: `${cardHeight}px`,
          flexShrink: 0,
          flexGrow: 0,
          fontSize: `${13 * fontScale}px`
        }}
      >
        {/* Spot Number / Name Badge */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <span className="px-4 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800 text-[10px] 2xl:text-xs font-black uppercase tracking-widest text-zinc-300 shadow-md">
            {spot.name}
          </span>
          {isBlocked && (
            <span className="px-3 py-1.5 rounded-full bg-red-600 text-white text-[9px] 2xl:text-[10px] font-black uppercase tracking-wider animate-bounce">
              BLOCKED
            </span>
          )}
        </div>

        {/* Dynamic Key Hook Guidance Target Ring */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none z-10 transition-all duration-500"
          style={{ top: `${hookOffset}%` }}
        >
          {/* Inner ring */}
          <div className={cn("w-14 h-14 2xl:w-20 2xl:h-20 rounded-full border-4 border-dashed flex items-center justify-center shadow-lg transition-all duration-500", ringNeonClass)}>
            <div className="w-4 h-4 rounded-full bg-current opacity-40 animate-ping"></div>
          </div>

          {/* Dotted Mount Guidelines */}
          {(showCrosshairs || alignmentMode) && (
            <div className="absolute w-[200%] h-[200%] pointer-events-none flex items-center justify-center">
              {/* Horizontal line */}
              <div className="absolute w-[300px] border-t-2 border-dotted border-yellow-500/80"></div>
              {/* Vertical line */}
              <div className="absolute h-[300px] border-l-2 border-dotted border-yellow-500/80"></div>
              {/* Concentric Circle */}
              <div className="absolute w-28 h-28 border border-dotted border-yellow-500/60 rounded-full"></div>
            </div>
          )}
          <span className="absolute top-[80px] font-mono text-[9px] text-zinc-500 font-extrabold uppercase tracking-widest">
            {alignmentMode ? 'Mount Hook Here' : 'Key Hook'}
          </span>
        </div>

        {/* Alignment Calibration Mode displays the crosshairs, name, and clear binder guides */}
        {alignmentMode ? (
          <div className="flex-1 flex flex-col justify-between items-center text-center py-2 h-full mt-10">
            <div className="flex flex-col items-center mt-6">
              <Crosshair className="w-8 h-8 text-yellow-500 animate-spin opacity-45 mb-2" />
              <p className="font-mono text-zinc-500 text-[10px] uppercase font-bold tracking-widest">ALIGNMENT CROSSHAIR ACTIVE</p>
            </div>
            
            {/* Outline representing the physical plastic pocket size overlay */}
            <div className="w-full border-4 border-dashed border-yellow-500/80 bg-yellow-500/5 rounded-2xl flex flex-col items-center justify-center p-6 mt-auto" style={{ height: `${94 - headerHeight}%` }}>
              <span className="text-[10px] font-black uppercase text-yellow-400 tracking-widest leading-none mb-1.5">Binder Holder sleeve</span>
              <span className="text-[9px] font-bold text-yellow-500/70 uppercase tracking-wide">15" x 12" Physical Area</span>
              <span className="text-[8px] font-semibold text-zinc-500 uppercase tracking-wider mt-2">Position physical pocket directly over this box</span>
            </div>
          </div>
        ) : (
          <>
            {/* Upper Digital Details Header Section */}
            <div 
              className="w-full flex flex-col justify-between z-10 min-h-0 overflow-hidden pr-1"
              style={{ height: `${headerHeight}%` }}
            >
              <div className="h-[25%]"></div> {/* Space buffer for Spot Badge and Hook Ring */}
              
              <div className="flex-1 flex flex-col justify-end gap-1.5 min-h-0">
                <AnimatePresence mode="wait">
                  {hasVehicle ? (
                    <motion.div 
                      key={vehicle?.id || 'vehicle'}
                      initial={{ y: 8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -8, opacity: 0 }}
                      className="flex flex-col gap-1 min-h-0"
                    >
                      <div className="flex items-start justify-between min-w-0 gap-2">
                        <div className="truncate">
                          {/* Job Number / Title */}
                          <h3 className="text-xs 2xl:text-[14px] font-black text-white leading-none truncate tracking-tight uppercase">
                            {job?.jobNumber ? `JOB #${job.jobNumber}` : 'NO ACTIVE JOB'}
                          </h3>
                          {/* Customer Name */}
                          {job?.customerName && (
                            <p className="text-[8px] 2xl:text-[10px] text-indigo-400 font-extrabold tracking-widest uppercase truncate mt-0.5 leading-none">
                              {job.customerName}
                            </p>
                          )}
                        </div>

                        {/* Interactive QR Redirector */}
                        {job?.id && (
                          <div className="bg-white p-1 rounded-xl shrink-0 hover:scale-105 transition-transform shadow-md" style={{ width: '60px', height: '60px' }} title="Scan details">
                            <QRCode value={qrUrl} size={60} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                          </div>
                        )}
                      </div>

                      {/* Vehicle summary */}
                      <div className="flex items-center justify-between text-[9px] font-bold text-white/90 bg-zinc-950/40 p-1.5 rounded-lg border border-zinc-900 leading-tight">
                        <span className="truncate max-w-[65%] uppercase font-black tracking-tight">{vehicle?.year || ''} {vehicle?.make || ''} {vehicle?.model || 'Vehicle'}</span>
                        <span className="font-mono text-[8px] bg-zinc-900 px-1 py-0.5 rounded text-zinc-400 shrink-0">VIN: {vehicle?.vin?.slice(-5) || 'N/A'}</span>
                      </div>

                      {/* Crew Assigned */}
                      {activeStaff.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap leading-none">
                          {activeStaff.slice(0, 3).map((session: any) => (
                            <span key={session.id} className="inline-flex items-center gap-1 text-[7px] font-black uppercase bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/15">
                              <span className="w-1 h-1 rounded-full bg-indigo-400 animate-ping"></span>
                              {session.userName?.split(' ')[0]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 pt-1 border-t border-zinc-900/40 leading-none">
                          <div className="flex flex-col">
                            <span className="text-[7px] font-black uppercase text-zinc-500 tracking-wider">Time in Spot</span>
                            <span className="text-[9px] font-black text-white leading-none mt-0.5">
                              {spotDuration || '--'}
                            </span>
                          </div>
                          {hasParts && (
                            <span className={cn(
                              "text-[7px] font-black uppercase px-1 py-0.5 rounded border shrink-0",
                              isPartsMissing ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            )}>
                              Parts: {isPartsMissing ? 'PENDING' : 'RECEIVED'}
                            </span>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div className="flex flex-col justify-end items-center py-2 text-center">
                      <p className="text-[9px] font-black uppercase text-zinc-650 tracking-widest leading-none">
                        Spot Empty
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Physical Binder Pocket Sleeve Area */}
            <div 
              className="w-full relative rounded-3xl border-2 border-dashed border-zinc-800/40 bg-zinc-950/30 flex flex-col items-center justify-center p-4 transition-all duration-700"
              style={{ 
                height: `${96 - headerHeight}%`,
                marginTop: 'auto'
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.02),transparent)] pointer-events-none rounded-3xl"></div>
              
              {/* Pocket visual mockup contents */}
              <div className="text-center flex flex-col items-center gap-1.5 opacity-30 group-hover:opacity-50 transition-opacity">
                <LayoutGrid className="w-5 h-5 text-zinc-700" />
                <span className="text-[8px] font-black uppercase text-zinc-600 tracking-widest leading-none">Paper Slot</span>
                <span className="text-[7px] font-bold text-zinc-700 uppercase tracking-tighter">Holds 11" x 8.5" Job Sheet</span>
              </div>
            </div>
          </>
        )}
      </motion.div>
    );
  };

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden relative font-sans">
      <Toaster position="top-right" richColors />

      {/* Background Matrix Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(17,24,39,0.9),rgba(0,0,0,1))] pointer-events-none z-0"></div>
      
      {/* Dynamic scanline overlay for futuristic monitor look */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] pointer-events-none opacity-40 z-0"></div>

      {/* Floating Subtle Settings Button when header is hidden */}
      {hideHeader && !isSettingsOpen && (
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="fixed top-4 right-4 z-40 p-2.5 bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition active:scale-95 text-zinc-550 hover:text-white opacity-20 hover:opacity-100 shadow-md"
          title="Open Grid Settings"
        >
          <Settings className="w-4 h-4 animate-pulse" />
        </button>
      )}

      {/* ----------------------------------------------------
          TOP NAVIGATION BAR
      ---------------------------------------------------- */}
      {!hideHeader && (
        <header className="z-10 flex items-center justify-between p-4 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 shadow-md h-20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded bg-indigo-600 text-[10px] font-black uppercase tracking-widest shadow">PARKING KEY DECK</span>
                <h1 className="text-lg 2xl:text-2xl font-black tracking-tighter uppercase">{businessName}</h1>
              </div>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                Dual 55" Monitor Key Sync Panel • Last Sync: {lastUpdated.toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LiveIndicator isDisconnected={!!connectionError} />
            
            {/* Quick Monitor Selector Pill */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-1 flex items-center gap-1 shadow-inner flex-wrap max-w-md">
              <button 
                onClick={() => setMonitorMode('left')}
                className={cn("px-3.5 py-1.5 text-[9px] 2xl:text-[10px] font-black uppercase tracking-wider rounded-lg transition-all", monitorMode === 'left' ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-350")}
              >
                Left (A)
              </button>
              <button 
                onClick={() => setMonitorMode('right')}
                className={cn("px-3.5 py-1.5 text-[9px] 2xl:text-[10px] font-black uppercase tracking-wider rounded-lg transition-all", monitorMode === 'right' ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-350")}
              >
                Right (B)
              </button>
              <button 
                onClick={() => setMonitorMode('top')}
                className={cn("px-3.5 py-1.5 text-[9px] 2xl:text-[10px] font-black uppercase tracking-wider rounded-lg transition-all", monitorMode === 'top' ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-350")}
              >
                Top (A)
              </button>
              <button 
                onClick={() => setMonitorMode('bottom')}
                className={cn("px-3.5 py-1.5 text-[9px] 2xl:text-[10px] font-black uppercase tracking-wider rounded-lg transition-all", monitorMode === 'bottom' ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-350")}
              >
                Bottom (B)
              </button>
              <button 
                onClick={() => setMonitorMode('span')}
                className={cn("px-3.5 py-1.5 text-[9px] 2xl:text-[10px] font-black uppercase tracking-wider rounded-lg transition-all", monitorMode === 'span' ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300")}
              >
                Span All
              </button>
            </div>

            {/* Configuration Trigger */}
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition active:scale-95 text-zinc-400 hover:text-white"
              title="Open Grid Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Fullscreen Button */}
            <button 
              onClick={toggleFullscreen}
              className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition active:scale-95 text-zinc-400 hover:text-white"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </header>
      )}

      {/* Offline Alert banners */}
      {connectionError && (
        <div className="z-10 bg-red-950/80 border-b border-red-900 p-2 text-center text-xs font-bold text-red-200 tracking-wider flex items-center justify-center gap-2 animate-pulse shrink-0">
          <AlertTriangle className="w-4 h-4" />
          {connectionError} {reloadCountdown !== null && `(Auto-reloading in ${reloadCountdown}s)`}
        </div>
      )}

      {/* ----------------------------------------------------
          MAIN PARKING KEY CABINET GRID
      ---------------------------------------------------- */}
      <main 
        className="flex-1 z-10 overflow-hidden relative flex flex-col justify-center min-h-0 h-full max-h-full"
        style={{
          padding: `${pagePadding}px`
        }}
      >
        {zones.length === 0 ? (
          <div className="max-w-xl mx-auto text-center p-8 bg-zinc-900/60 border border-zinc-800 rounded-3xl backdrop-blur">
            <LayoutGrid className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2 uppercase tracking-wide">No Parking Spots Configured</h3>
            <p className="text-sm text-zinc-500 mb-6">
              There are currently no active parking spots defined. You can configure parking spots under the "Zones Config" tab in System Settings.
            </p>
            <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-2xl text-xs font-mono text-indigo-400 flex flex-col gap-1 text-left">
              <span>1. Go to Facility {'>'} Zones Config</span>
              <span>2. Click 'Add Zone'</span>
              <span>3. Set the Type to 'Parking Spot' or 'Lot'</span>
              <span>4. Give it a name like 'Spot 1'</span>
            </div>
          </div>
        ) : (
          <div 
            className="grid w-full h-full min-h-0 py-2 justify-center content-center"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, max-content))`,
              gridTemplateRows: `repeat(${gridRows}, minmax(0, max-content))`,
              gap: `${gridGap}px`
            }}
          >
            {displayGridSpots.map(spot => renderSpotCard(spot))}
          </div>
        )}
      </main>

      {/* Viewport Sizing Fit Warning - Floats persistently on top of viewport */}
      {(() => {
        const estimatedHeight = (gridRows * cardHeight) + ((gridRows - 1) * gridGap) + (hideHeader ? 0 : 80) + (pagePadding * 2);
        const isOverflowing = estimatedHeight > viewportHeight;
        
        if (!isOverflowing || alignmentMode) return null;
        
        return (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-black px-6 py-3 rounded-2xl shadow-[0_10px_30px_rgba(245,158,11,0.4)] border border-amber-600 flex items-center gap-3 animate-bounce max-w-2xl text-left">
            <AlertTriangle className="w-5 h-5 text-black shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider leading-none">Fit Alert: Content Overflowing Viewport ({estimatedHeight}px &gt; {viewportHeight}px)</p>
              <p className="text-[9px] font-bold text-black/80 mt-1 leading-normal">
                Scale down Card Height / Rows, reduce Gap / Padding, or toggle "Hide Header (Kiosk Mode)" in settings to fit cards inside this screen!
              </p>
            </div>
          </div>
        );
      })()}

      {/* ----------------------------------------------------
          SLIDE-OUT CALIBRATION SETTINGS PANEL
      ---------------------------------------------------- */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-transparent z-40"
            />

            {/* Settings side drawer */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 h-full w-[360px] 2xl:w-[420px] bg-zinc-900/95 border-l border-zinc-800 shadow-2xl p-6 overflow-y-auto no-scrollbar z-50 flex flex-col gap-6"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-black uppercase tracking-tight">Deck Calibration</h2>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  Close
                </button>
              </div>

              {/* Setting Groups */}
              <div className="space-y-6 flex-1 text-xs">
                
                {/* Quick Calibrated Presets */}
                <div className="space-y-2 pb-4 border-b border-zinc-800">
                  <label className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider">Quick Calibration Presets</label>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Instantly load calculated dimensions to match your physical pockets perfectly.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => applyPreset('15x15_1080p')}
                      className="py-2.5 px-3 text-left font-bold uppercase tracking-wider rounded-xl border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800 text-[10px] flex items-center justify-between group transition-colors"
                    >
                      <span className="text-zinc-300">15" x 15" Pocket (1080p Viewport)</span>
                      <span className="text-[9px] font-mono text-zinc-500 group-hover:text-indigo-400 transition-colors">3x1 Grid • 600px</span>
                    </button>
                    <button
                      onClick={() => applyPreset('15x15_4k')}
                      className="py-2.5 px-3 text-left font-bold uppercase tracking-wider rounded-xl border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800 text-[10px] flex items-center justify-between group transition-colors"
                    >
                      <span className="text-zinc-300">15" x 15" Pocket (4K Viewport)</span>
                      <span className="text-[9px] font-mono text-zinc-500 group-hover:text-indigo-400 transition-colors">3x1 Grid • 1200px</span>
                    </button>
                    <button
                      onClick={() => applyPreset('12x15_1080p')}
                      className="py-2.5 px-3 text-left font-bold uppercase tracking-wider rounded-xl border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800 text-[10px] flex items-center justify-between group transition-colors"
                    >
                      <span className="text-zinc-300">12" x 15" Pocket (1080p Binder)</span>
                      <span className="text-[9px] font-mono text-zinc-500 group-hover:text-indigo-400 transition-colors">3x1 Grid • 480x600px</span>
                    </button>
                  </div>
                </div>

                {/* 1. Monitor Selection */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider">Monitor Layout</label>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Select if this screen serves as the Left/Right Monitor, Top/Bottom Monitor, spans all spots, or shows a custom spot range.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {['left', 'right', 'top', 'bottom', 'span', 'custom'].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setMonitorMode(mode as any)}
                        className={cn(
                          "py-2 px-1 text-center font-bold uppercase tracking-wider rounded-xl border transition-all text-[10px]",
                          monitorMode === mode 
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" 
                            : "bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        {mode === 'left' ? 'Left A' 
                         : mode === 'right' ? 'Right B' 
                         : mode === 'top' ? 'Top A' 
                         : mode === 'bottom' ? 'Bottom B' 
                         : mode === 'span' ? 'Spanned' 
                         : 'Custom'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Range Sliders */}
                {monitorMode === 'custom' && (
                  <div className="p-3 bg-zinc-950/50 border border-zinc-850 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-350">
                    <h4 className="font-extrabold uppercase text-indigo-400 text-[10px]">Configure Custom Range</h4>
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-bold text-[9px] uppercase">
                        <span className="text-zinc-400">Start Spot Index:</span>
                        <span className="text-white">{customStart} (Spot: {zones[customStart - 1]?.name || 'N/A'})</span>
                      </div>
                      <input 
                        type="range" min="1" max={zones.length || 1}
                        value={customStart} 
                        onChange={(e) => setCustomStart(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-bold text-[9px] uppercase">
                        <span className="text-zinc-400">End Spot Index:</span>
                        <span className="text-white">{customEnd} (Spot: {zones[customEnd - 1]?.name || 'N/A'})</span>
                      </div>
                      <input 
                        type="range" min={customStart} max={zones.length || 1}
                        value={customEnd} 
                        onChange={(e) => setCustomEnd(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <p className="text-[8px] text-zinc-550 leading-normal font-medium">
                      Displaying {Math.max(0, customEnd - customStart + 1)} spots out of {zones.length} total.
                    </p>
                    
                    <div className="pt-2.5 border-t border-zinc-900 flex flex-col gap-1 text-[8px] font-mono text-zinc-500 leading-relaxed">
                      <span className="font-bold text-indigo-400 uppercase">3x1 Multi-Monitor Index Guide:</span>
                      <span>• TV A (Screen 1): Start = 1, End = 3</span>
                      <span>• TV B (Screen 2): Start = 4, End = 6</span>
                      <span>• TV C (Screen 3): Start = 7, End = 9</span>
                      <span>• TV D (Screen 4): Start = 10, End = 12</span>
                      <span className="text-[7px] text-zinc-600 font-sans italic mt-1 leading-normal">Note: Last TV will automatically pad empty placeholders to maintain physical hook dimensions perfectly!</span>
                    </div>
                  </div>
                )}

                {/* 2. Grid Sizing */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider">Grid Matrix (Columns x Rows)</label>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Adjust columns and rows to match your physical key hook configuration.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Columns: {gridCols}</span>
                      <input 
                        type="range" min="1" max="8" 
                        value={gridCols} 
                        onChange={(e) => setGridCols(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Rows: {gridRows}</span>
                      <input 
                        type="range" min="1" max="6" 
                        value={gridRows} 
                        onChange={(e) => setGridRows(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Key Hook Offset Position */}
                <div className="space-y-2.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Hook Placement Height</label>
                    <span className="font-mono text-zinc-400">{hookOffset}%</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Adjusts the height of the glowing circular key rings to match physical pegs mounted on your glass.
                  </p>
                  <input 
                    type="range" min="10" max="60" step="1"
                    value={hookOffset} 
                    onChange={(e) => setHookOffset(Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* 4. Formatting Scales */}
                <div className="space-y-2.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Text / Font Scale</label>
                    <span className="font-mono text-zinc-400">{fontScale.toFixed(2)}x</span>
                  </div>
                  <input 
                    type="range" min="0.7" max="1.5" step="0.05"
                    value={fontScale} 
                    onChange={(e) => setFontScale(Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Grid Spacing & Padding Controls */}
                <div className="space-y-4 pt-3 border-t border-zinc-800">
                  <label className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider">Spacing & Padding</label>
                  <p className="text-[10px] text-zinc-555 leading-normal">
                    Fiddle spacing to gain screen space or pad out massive 4K landscape screens!
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Grid Gap: {gridGap}px</span>
                      <input 
                        type="range" min="4" max="80" step="2"
                        value={gridGap} 
                        onChange={(e) => setGridGap(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Page Margin: {pagePadding}px</span>
                      <input 
                        type="range" min="0" max="120" step="4"
                        value={pagePadding} 
                        onChange={(e) => setPagePadding(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Custom Sizing for Physical Binder Holders */}
                <div className="space-y-4 pt-3 border-t border-zinc-800">
                  <label className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider">Physical Pocket Sizing Calibration</label>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Adjust spot dimensions to perfectly match your 15"x12" physical paper binder pockets on the glass screen.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Card Width: {cardWidth}px</span>
                      <input 
                        type="range" min="200" max="1600" step="5"
                        value={cardWidth} 
                        onChange={(e) => setCardWidth(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Card Height: {cardHeight}px</span>
                      <input 
                        type="range" min="300" max="1800" step="5"
                        value={cardHeight} 
                        onChange={(e) => setCardHeight(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Digital Header Height: {headerHeight}%</span>
                      <span className="text-[10px] text-zinc-500 uppercase">Slid-in paper: {100 - headerHeight}%</span>
                    </div>
                    <input 
                      type="range" min="20" max="65" step="1"
                      value={headerHeight} 
                      onChange={(e) => setHeaderHeight(Number(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                </div>

                {/* 5. Setup helpers */}
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <label className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider">Setup & Calibration Tools</label>
                  
                  {/* Hide Header switch */}
                  <div className="flex items-center justify-between p-3 bg-zinc-950/60 rounded-2xl border border-zinc-800">
                    <div>
                      <h4 className="font-extrabold uppercase text-zinc-350">Hide Top Header</h4>
                      <p className="text-[9px] text-zinc-500 leading-normal mt-0.5">Hides the top navigation bar to maximize vertical screen real estate for cards (Kiosk Mode).</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={hideHeader}
                      onChange={(e) => setHideHeader(e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                    />
                  </div>

                  {/* Crosshairs switch */}
                  <div className="flex items-center justify-between p-3 bg-zinc-950/60 rounded-2xl border border-zinc-800">
                    <div>
                      <h4 className="font-extrabold uppercase text-zinc-350">Show Hook Guidelines</h4>
                      <p className="text-[9px] text-zinc-500 leading-normal mt-0.5">Project concentric dotted crosshairs to position hooks correctly.</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={showCrosshairs}
                      onChange={(e) => setShowCrosshairs(e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                    />
                  </div>

                  {/* Alignment-Only Mode switch */}
                  <div className="flex items-center justify-between p-3 bg-zinc-950/60 rounded-2xl border border-zinc-800">
                    <div>
                      <h4 className="font-extrabold uppercase text-zinc-350">Mounting Calibration Mode</h4>
                      <p className="text-[9px] text-zinc-500 leading-normal mt-0.5">Hide all vehicle details to just show crosshairs and slot names. Recommended for hook installation.</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={alignmentMode}
                      onChange={(e) => setAlignmentMode(e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                    />
                  </div>
                </div>

              </div>

              {/* Footer info box */}
              <div className="bg-zinc-950 border border-zinc-800/80 p-3 rounded-2xl flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-zinc-400 leading-relaxed">
                  Tip: Bookmark this page on your TV's browser with the URL parameters preset so it launches automatically into the correct screen view on reboot!
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
