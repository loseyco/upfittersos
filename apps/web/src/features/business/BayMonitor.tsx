import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, limit, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Maximize, Minimize, AlertTriangle, ShoppingCart } from 'lucide-react';
import _QRCode from 'react-qr-code';
import { cn } from '../../lib/utils';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import type { Zone } from './ZoneModals';

const QRCode = (_QRCode as any).default || _QRCode;
import type { Vehicle } from './VehicleSelector';

const LiveIndicator = () => (
  <div className="flex items-center gap-2 3xl:gap-4 bg-zinc-900/50 px-3 py-1.5 3xl:px-6 3xl:py-3 rounded-lg 3xl:rounded-2xl border border-zinc-800 relative overflow-hidden group">
    <div className="relative">
      <div className="w-2 h-2 3xl:w-4 3xl:h-4 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)] z-10"></div>
      <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20 scale-150"></div>
    </div>
    <span className="text-zinc-400 text-xs 2xl:text-sm 3xl:text-[30px] font-black uppercase tracking-widest leading-none">LIVE</span>
    <motion.div 
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full"
      animate={{ x: ['100%', '-100%'] }}
      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
    />
  </div>
);

export function BayMonitor({ tenantId }: { tenantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [businessName, setBusinessName] = useState('UPFITTERS OS');
  const [monitorSettings, setMonitorSettings] = useState<any>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    getDoc(doc(db, 'businesses', tenantId)).then(snap => {
      if (snap.exists()) setBusinessName(snap.data().name || 'UPFITTERS OS');
    });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBusinessName(data.name || 'UPFITTERS OS');
        setMonitorSettings(data);
      }
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/zones`));
    const unsub = onSnapshot(q, (snap) => {
      const data: Zone[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Zone));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setZones(data);
      setLastUpdated(new Date());
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    // Only fetch jobs that are NOT 'Completed' or 'Delivered' to save memory
    const q = query(
      collection(db, `businesses/${tenantId}/jobs`),
      where('status', 'not-in', ['Completed', 'Delivered'])
    );
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    // Only fetch pending/active parts requests
    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('status', 'in', ['pending', 'ordered', 'received'])
    );
    const unsub = onSnapshot(q, (snap) => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/vehicles`), limit(1000));
    const unsub = onSnapshot(q, (snap) => {
      const data: Vehicle[] = [];
      const seen = new Set();
      snap.forEach(doc => {
        const v = { id: doc.id, ...doc.data() } as Vehicle;
        const key = (v.vin || v.id).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          data.push(v);
        }
      });
      setVehicles(data);
      setLastUpdated(new Date());
    });
    return () => unsub();
  }, [tenantId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      localStorage.setItem('bayMonitorFullscreenPreference', 'true');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      localStorage.removeItem('bayMonitorFullscreenPreference');
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (isCurrentlyFullscreen) {
        localStorage.setItem('bayMonitorFullscreenPreference', 'true');
      } else {
        // We don't automatically remove it here because a reload might have cleared it
        // but the user might still want it. 
        // We only remove if they explicitly clicked the exit button (handled in toggleFullscreen)
      }
    };

    const attemptAutoFullscreen = () => {
      const preference = localStorage.getItem('bayMonitorFullscreenPreference');
      if (preference === 'true' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          // Expected to fail without gesture
        });
      }
    };

    // Listen for the first interaction to restore fullscreen
    const handleFirstInteraction = () => {
      const preference = localStorage.getItem('bayMonitorFullscreenPreference');
      if (preference === 'true' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      // Remove listener after first try
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    // Initial check
    attemptAutoFullscreen();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  const bayZones = zones.filter(zone => !zone.isArchived && zone.type === 'bay');
  const parkingZones = zones
    .filter(zone => !zone.isArchived && zone.type === 'parking')
    .sort((a, b) => {
      const aJob = jobs.find((j: any) => j.id === a.currentJobId);
      const bJob = jobs.find((j: any) => j.id === b.currentJobId);
      const aHasVehicle = !!(aJob?.vehicleVin || a.currentVehicleVin);
      const bHasVehicle = !!(bJob?.vehicleVin || b.currentVehicleVin);
      if (aHasVehicle && !bHasVehicle) return -1;
      if (!aHasVehicle && bHasVehicle) return 1;
      return 0;
    });

  const occupiedBays = bayZones.filter(z => !!z.currentVehicleVin).length;
  const occupiedParking = parkingZones.filter(z => !!z.currentVehicleVin).length;

  const renderZoneCard = (zone: Zone, isCompact: boolean = false) => {
    const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
    const job = jobs.find((j: any) => j.id === zone.currentJobId);
    
    const target = job || zone;
    const legacyBlocker = target?.blocker ? [{ message: target.blocker, status: 'active' }] : [];
    const activeBlockers = (target?.blockers || legacyBlocker).filter((b: any) => b.status === 'active');
    const isBlocked = activeBlockers.length > 0;

    const currentVin = job?.vehicleVin || zone?.currentVehicleVin;
    const relevantParts = partsRequests.filter((pr: any) => {
      const prStatus = (pr.status || '').toLowerCase();
      const isActive = ['pending', 'received', 'ordered'].includes(prStatus);
      if (!isActive) return false;
      
      // Strictly tie parts to the Job ID if it exists
      if (job?.id && pr.jobId === job.id) return true;
      
      // Fallback to VIN only if there is NO job assigned to this zone
      // This allows tracking parts for a vehicle before a job is created
      if (!job?.id && currentVin && pr.vin === currentVin) return true;
      
      return false;
    });
    const partsArrived = relevantParts.some(pr => (pr.status || '').toLowerCase() === 'received');

    const requestedCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'pending').length;
    const orderedCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'ordered').length;
    const receivedCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'received').length;
    const hasParts = requestedCount + orderedCount + receivedCount > 0;

    const etaRaw = job?.expectedFinishTime || job?.eta || zone.eta;
    let isOverdue = false;
    let isUrgent = false; // Based on business settings
    let timeLabel = '';
    let etaDate: Date | null = null;

    const urgentThreshold = monitorSettings?.monitorUrgentThreshold || 4;

    if (etaRaw) {
      const parsedDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
      etaDate = parsedDate;
      const diffMs = parsedDate.getTime() - now;
      isOverdue = diffMs < 0;
      isUrgent = diffMs > 0 && diffMs < urgentThreshold * 3600 * 1000;
      
      const absDiff = Math.abs(diffMs);
      const days = Math.floor(absDiff / 86400000);
      const hours = Math.floor((absDiff % 86400000) / 3600000);
      const minutes = Math.floor((absDiff % 3600000) / 60000);
      timeLabel = days > 0 ? `${days}d ${hours}h` : (hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    }

    const hasVehicle = !!currentVin;

    const formatSmartDuration = (seconds: number, includeSeconds: boolean = false) => {
      if (seconds <= 0) return '0m';
      const years = Math.floor(seconds / 31536000);
      const months = Math.floor((seconds % 31536000) / 2592000);
      const days = Math.floor((seconds % 2592000) / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);

      if (years > 0) return `${years}y ${months}mo`;
      if (months > 0) return `${months}mo ${days}d`;
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      if (includeSeconds && seconds < 3600) return `${minutes}m ${secs}s`;
      return `${minutes}m`;
    };

    const calculateTotalDuration = (totalSeconds: number, sessionStart: any, includeSeconds: boolean = false) => {
      let total = totalSeconds || 0;
      if (sessionStart) {
        const start = sessionStart.seconds ? sessionStart.seconds * 1000 : new Date(sessionStart).getTime();
        total += Math.max(0, Math.floor((now - start) / 1000));
      }
      if (total === 0) return null;
      return formatSmartDuration(total, includeSeconds);
    };

    // Determine card color based on priority and business settings
    let cardBg = "bg-zinc-900 border-zinc-800";
    let customBgStyle: React.CSSProperties = {};
    let textColor = "text-white";

    const colors = {
      blocked: monitorSettings?.monitorColorBlocked || '#b91c1c', // red-700
      urgent: monitorSettings?.monitorColorUrgent || '#d97706', // amber-600
      overdue: monitorSettings?.monitorColorOverdue || '#b91c1c', // red-700
      active: monitorSettings?.monitorColorActive || '#1d4ed8', // blue-700
      empty: monitorSettings?.monitorColorEmpty || '#27272a' // zinc-800
    };
    
    if (isBlocked || (hasVehicle && isOverdue)) {
      customBgStyle = { backgroundColor: colors.overdue, borderColor: `${colors.overdue}ff`, boxShadow: `0 0 30px ${colors.overdue}66` };
      textColor = "text-white font-black";
    } else if (hasVehicle && (isUrgent || (hasParts && !partsArrived))) {
      customBgStyle = { backgroundColor: colors.urgent, borderColor: `${colors.urgent}ff`, boxShadow: `0 0 30px ${colors.urgent}4d` };
      textColor = "text-white font-black";
    } else if (hasVehicle) {
      customBgStyle = { backgroundColor: colors.active, borderColor: `${colors.active}ff` };
      textColor = "text-white";
    } else {
      customBgStyle = { backgroundColor: `${colors.empty}`, borderColor: `${colors.empty}80`, opacity: 0.6 };
      textColor = "text-zinc-400";
    }

    const timeInArea = () => {
      const timestamp = zone.lastAssignedAt || zone.updatedAt || zone.createdAt;
      if (!timestamp) return 'Unknown';
      let date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp.seconds ? timestamp.seconds * 1000 : timestamp);
      if (isNaN(date.getTime())) return 'Unknown';
      const diff = Math.floor((now - date.getTime()) / 1000);
      if (diff < 0) return 'Just now';
      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    const lastUpdatedRaw = job?.updatedAt || zone.updatedAt || zone.createdAt;
    const lastUpdatedDate = lastUpdatedRaw ? (typeof lastUpdatedRaw.toDate === 'function' ? lastUpdatedRaw.toDate() : new Date(lastUpdatedRaw.seconds ? lastUpdatedRaw.seconds * 1000 : lastUpdatedRaw)) : new Date();
    
    const isStale = lastUpdatedDate && (Date.now() - lastUpdatedDate.getTime() > (monitorSettings?.monitorStaleThreshold || 4) * 60 * 60 * 1000);

    const lastUpdated = () => {
      if (!lastUpdatedRaw) return 'Never';
      if (isNaN(lastUpdatedDate.getTime())) return 'Never';
      const diff = Math.floor((now - lastUpdatedDate.getTime()) / 1000);
      if (diff < 60) return 'Just now';
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      if (hours > 24) return `${Math.floor(hours/24)}d ago`;
      if (hours > 0) return `${hours}h ago`;
      return `${minutes}m ago`;
    };
    
    const statusKey = `${isBlocked}-${requestedCount}-${receivedCount}-${job?.lastUpdated || ''}-${hasVehicle}`;

    const cardVariants = {
      initial: { opacity: 0, scale: 0.95 },
      animate: { 
        opacity: 1, 
        scale: 1,
        boxShadow: (isBlocked || (hasVehicle && isOverdue)) 
          ? [`0 0 20px ${colors.overdue}66`, `0 0 50px ${colors.overdue}cc`, `0 0 20px ${colors.overdue}66`]
          : (hasVehicle && (isUrgent || (hasParts && !partsArrived)))
            ? [`0 0 15px ${colors.urgent}4d`, `0 0 40px ${colors.urgent}99`, `0 0 15px ${colors.urgent}4d`]
            : "0px 0px 0px rgba(0,0,0,0)",
        transition: {
          boxShadow: {
            repeat: Infinity,
            duration: 3,
            ease: "easeInOut" as const
          }
        }
      },
      exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
    };

    if (isCompact) {
      return (
        <motion.div 
          layout
          initial="initial"
          animate="animate"
          exit="exit"
          variants={cardVariants}
          key={zone.id} 
          className={cn("relative rounded-xl border flex flex-col justify-center transition-all duration-1000 min-h-0 overflow-hidden p-1.5 3xl:p-3", cardBg)}
          style={customBgStyle}
        >
          {/* Status Flash Overlay */}
          <motion.div
            key={statusKey}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className={cn(
              "absolute inset-0 pointer-events-none z-20",
              isBlocked ? "bg-red-500/20" : hasParts ? "bg-amber-500/20" : "bg-emerald-500/20"
            )}
          />

          <div className="flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <h2 className={cn("text-[10px] 2xl:text-sm 3xl:text-2xl font-black tracking-widest uppercase opacity-50", textColor)}>
                {zone.name}
              </h2>
              <div className="flex items-center gap-0.5 shrink-0 z-10">
                {isBlocked && (
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="bg-red-500 text-white px-1 py-0.5 rounded-[2px] text-[7px] 3xl:text-[12px] font-black uppercase tracking-widest flex items-center leading-none"
                  >
                     !
                  </motion.div>
                )}
                {hasParts && (
                  <motion.div 
                    key={`${requestedCount}-${receivedCount}`}
                    animate={{ y: [0, -5, 0] }}
                    className={cn(
                      "px-1 py-0.5 rounded-[2px] text-[7px] 3xl:text-[12px] font-black uppercase tracking-widest flex items-center leading-none",
                      partsArrived ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                    )}
                  >
                     {requestedCount}/{orderedCount}/{receivedCount}
                  </motion.div>
                )}
              </div>
            </div>
            
            <AnimatePresence mode="wait">
              {hasVehicle ? (
                <motion.div 
                  key={vehicle?.id || 'vehicle'}
                  initial={{ x: 10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -10, opacity: 0 }}
                  className="flex flex-col"
                >
                  <div className="text-[12px] 2xl:text-base 3xl:text-3xl font-black text-white line-clamp-1 leading-tight tracking-tight">
                    {vehicle?.year || ''} {vehicle?.make || ''} {vehicle?.model || 'Vehicle'}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <div className="text-[8px] 3xl:text-[16px] text-white/40 font-bold tracking-widest uppercase">
                      {timeInArea()}
                      {job && calculateTotalDuration(zone.type === 'bay' ? job.totalBayTimeSeconds : job.totalParkingTimeSeconds, zone.type === 'bay' ? job.currentBaySessionStart : job.currentParkingSessionStart) && (
                        <span className="ml-2 text-white/20">
                          / {calculateTotalDuration(zone.type === 'bay' ? job.totalBayTimeSeconds : job.totalParkingTimeSeconds, zone.type === 'bay' ? job.currentBaySessionStart : job.currentParkingSessionStart)}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  className="text-[10px] 2xl:text-xs 3xl:text-2xl font-bold text-zinc-800 uppercase tracking-widest"
                >
                  ---
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div 
        layout
        initial="initial"
        animate="animate"
        exit="exit"
        variants={cardVariants}
        key={zone.id} 
        className={cn(
          "@container rounded-[1.25rem] p-[max(0.5rem,1.2cqw)] border-[3px] flex flex-col transition-all duration-500 min-h-0 overflow-hidden relative", 
          cardBg,
          !hasVehicle && "border-dashed opacity-60"
        )}
        style={customBgStyle}
      >
        {/* Status Flash Effect */}
        <motion.div
          key={statusKey}
          initial={{ opacity: 1 }}
          animate={{ 
            opacity: [0, 1, 0, 1, 0],
            backgroundColor: [
              "rgba(255, 255, 255, 0.2)",
              "rgba(239, 68, 68, 0.4)", // Red
              "rgba(59, 130, 246, 0.4)", // Blue
              "rgba(239, 68, 68, 0.4)", // Red
              "rgba(59, 130, 246, 0.4)"  // Blue
            ],
            boxShadow: [
              "inset 0 0 0px rgba(0,0,0,0)",
              "inset 0 0 60px rgba(239, 68, 68, 0.6)",
              "inset 0 0 60px rgba(59, 130, 246, 0.6)",
              "inset 0 0 60px rgba(239, 68, 68, 0.6)",
              "inset 0 0 60px rgba(59, 130, 246, 0.6)"
            ]
          }}
          transition={{ duration: 1.2, ease: "linear" }}
          className="absolute inset-0 pointer-events-none z-20 border-[8px] border-double border-white/20"
        />
        <div className="flex-1 min-h-0 flex flex-col justify-between">
          <div className="flex items-start justify-between mb-0.5">
            <h2 
              className={cn("font-black tracking-tighter line-clamp-1 leading-none uppercase shrink-0", textColor)}
              style={{ fontSize: 'clamp(1rem, 7cqw, 3rem)' }}
            >
              {zone.name}
            </h2>
            <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
              {isBlocked && (
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                  className="bg-red-500 text-white px-1.5 py-0.5 rounded-md text-[max(0.5rem,1.8cqw)] font-black uppercase tracking-widest flex items-center gap-1"
                >
                  <AlertTriangle className="w-[max(0.6rem,2cqw)] h-[max(0.6rem,2cqw)]" /> 
                  Blocked
                </motion.div>
              )}
              {hasParts && (
                <motion.div 
                  key={`${requestedCount}-${receivedCount}`}
                  animate={{ scale: [1, 1.1, 1] }}
                  className={cn(
                    "px-1.5 py-0.5 rounded-md text-[max(0.5rem,1.8cqw)] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg",
                    partsArrived ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                  )}
                >
                  <ShoppingCart className="w-[max(0.6rem,2cqw)] h-[max(0.6rem,2cqw)]" /> 
                  {requestedCount}/{orderedCount}/{receivedCount}
                </motion.div>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {hasVehicle ? (
              <motion.div 
                key={vehicle?.id || 'vehicle'}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                className="flex-1 min-h-0 flex flex-col justify-center py-0.5"
              >
                <div 
                  className="font-black text-white line-clamp-1 tracking-tighter leading-none mb-0.5"
                  style={{ fontSize: 'clamp(0.9rem, 6.5cqw, 2.8rem)' }}
                >
                  {vehicle?.year || ''} {vehicle?.make || ''} {vehicle?.model || 'Vehicle'}
                </div>
                {job?.title && (
                  <div 
                    className={cn("font-bold line-clamp-1 leading-none mb-0.5 tracking-tight", textColor, "opacity-90")}
                    style={{ fontSize: 'clamp(0.7rem, 4cqw, 1.8rem)' }}
                  >
                    {job.title}
                  </div>
                )}
                <div 
                  className="font-black uppercase tracking-widest text-white/30 line-clamp-1 leading-none"
                  style={{ fontSize: 'clamp(0.5rem, 2cqw, 1rem)' }}
                >
                  {(!job?.title || job.title.toLowerCase().trim() !== (job?.customerName || vehicle?.customerName || '').toLowerCase().trim()) 
                    ? (job?.customerName || vehicle?.customerName || 'No Customer')
                    : ''}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 min-h-0 flex flex-col justify-center"
              >
                <div 
                  className="font-black text-zinc-900/40 uppercase tracking-tighter leading-none"
                  style={{ fontSize: 'clamp(1rem, 6cqw, 3.5rem)' }}
                >
                  Empty
                </div>
                <div 
                  className="font-bold uppercase tracking-widest text-zinc-500 mt-1.5 leading-none"
                  style={{ fontSize: 'clamp(0.6rem, 2cqw, 1.1rem)' }}
                >
                  For {timeInArea()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {hasVehicle && (
          <div className="pt-1 border-t border-white/10 shrink-0 grid grid-cols-2 gap-1.5">
            <div className="flex flex-col">
              <span className="font-bold uppercase tracking-widest text-white/60 text-[max(0.6rem,2cqw)] leading-none mb-1">
                {zone.type === 'bay' ? 'Session' : 'Parked'}
              </span>
              <span 
                className="font-black text-white leading-none truncate"
                style={{ fontSize: 'clamp(0.9rem, 3.5cqw, 2rem)' }}
              >
                {calculateTotalDuration(0, zone.type === 'bay' ? job?.currentBaySessionStart : job?.currentParkingSessionStart, true) || '---'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold uppercase tracking-widest text-white/60 text-[max(0.6rem,2cqw)] leading-none mb-1">
                {zone.type === 'bay' ? 'Total Bay' : 'Total Lot'}
              </span>
              <span 
                className="font-black text-white leading-none truncate"
                style={{ fontSize: 'clamp(0.9rem, 3.5cqw, 2rem)' }}
              >
                {job ? calculateTotalDuration(zone.type === 'bay' ? job.totalBayTimeSeconds : job.totalParkingTimeSeconds, zone.type === 'bay' ? job.currentBaySessionStart : job.currentParkingSessionStart) || '---' : '---'}
              </span>
            </div>
            <div className="flex flex-col col-span-2 mt-1.5 pt-1.5 border-t border-white/5">
              <span className="font-bold uppercase tracking-widest text-white/40 text-[max(0.5rem,1.8cqw)] leading-none mb-1">Last Updated</span>
              <span 
                className={cn(
                  "font-black leading-none truncate", 
                  isStale ? "text-amber-400" : "text-white/60"
                )}
                style={{ fontSize: 'clamp(0.8rem, 2.8cqw, 1.8rem)' }}
              >
                {lastUpdated()}
              </span>
            </div>

            {etaDate && (
              <div className="flex flex-col col-span-2 mt-2">
                <div className="flex items-center justify-between border-t border-white/20 pt-2">
                  <div className="flex flex-col">
                    <span className="font-bold uppercase tracking-widest text-white/60 text-[max(0.5rem,1.8cqw)] leading-none mb-1">ETA</span>
                    <span 
                      className="font-black text-white/70 leading-none truncate"
                      style={{ fontSize: 'clamp(0.8rem, 2.8cqw, 1.8rem)' }}
                    >
                      {etaDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-bold uppercase tracking-widest text-white/60 text-[max(0.5rem,1.8cqw)] leading-none mb-1">Due</span>
                    <span 
                      className={cn(
                        "font-black tracking-tighter leading-none truncate", 
                        isOverdue ? "text-red-400 animate-pulse" : isUrgent ? "text-amber-300" : "text-emerald-400"
                      )}
                      style={{ fontSize: 'clamp(1.1rem, 4.5cqw, 3rem)' }}
                    >
                      {isOverdue ? `-${timeLabel}` : timeLabel}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="h-[100dvh] bg-black text-white p-4 md:p-6 lg:p-8 3xl:p-8 relative overflow-hidden flex flex-col">
      <Toaster position="top-right" richColors theme="system" closeButton />
      <div className="flex items-center justify-between mb-4 lg:mb-6 3xl:mb-3 shrink-0">
        <div className="flex items-center gap-4 lg:gap-6 3xl:gap-8">
          <div className="hidden md:flex items-center justify-center bg-white p-1.5 3xl:p-3 rounded-xl 3xl:rounded-3xl shrink-0">
            <div className="w-12 h-12 2xl:w-16 2xl:h-16 3xl:w-28 3xl:h-28">
              <QRCode value="https://upfittersos.com" style={{ width: '100%', height: '100%' }} level="L" />
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <div className="text-zinc-400 font-black uppercase tracking-widest text-sm md:text-lg 2xl:text-2xl 3xl:text-[60px] leading-none mb-1 3xl:mb-3">
              {businessName}
            </div>
            <h1 className="text-2xl md:text-4xl 2xl:text-5xl 3xl:text-[120px] font-black tracking-tighter text-white leading-none">
              BAY MONITOR
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4 lg:gap-8 3xl:gap-8 relative z-10">
          <div className="flex flex-col items-end gap-1 3xl:gap-2">
            <LiveIndicator />
            <div className="text-[10px] md:text-xs 3xl:text-[24px] font-bold text-zinc-600 uppercase tracking-widest leading-none">
              Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
          <div className="text-right flex flex-col justify-center">
            <div className="text-xl md:text-3xl 2xl:text-4xl 3xl:text-[90px] font-black tracking-tight leading-none mb-0.5 3xl:mb-2">
              {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-zinc-400 text-sm md:text-lg 2xl:text-xl 3xl:text-[45px] font-bold uppercase tracking-widest leading-none">
              {new Date(now).toLocaleDateString()}
            </div>
          </div>
          <button 
            onClick={toggleFullscreen}
            className="hidden md:block p-3 3xl:p-6 bg-zinc-900 hover:bg-zinc-800 rounded-xl 3xl:rounded-2xl transition-colors text-zinc-400 hover:text-white shrink-0 ml-2 3xl:ml-4 border border-zinc-800"
          >
            {isFullscreen ? <Minimize className="w-6 h-6 3xl:w-10 3xl:h-10" /> : <Maximize className="w-6 h-6 3xl:w-10 3xl:h-10" />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-2 lg:gap-4 3xl:gap-8">
        {/* Main Bays Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between mb-2 3xl:mb-4">
            <h3 
              className="font-black uppercase tracking-[0.2em] text-zinc-500"
              style={{ fontSize: 'clamp(0.8rem, 3cqw, 2.5rem)' }}
            >
              Active Shop
            </h3>
            <div className="flex items-center gap-2 3xl:gap-4 bg-zinc-900 border border-zinc-800 px-3 py-1 3xl:px-4 3xl:py-2 rounded-lg 3xl:rounded-xl shadow-lg">
              <span 
                className="text-zinc-500 font-black uppercase tracking-widest"
                style={{ fontSize: 'clamp(0.6rem, 2cqw, 1.5rem)' }}
              >
                Bays:
              </span>
              <span 
                className="text-white font-black"
                style={{ fontSize: 'clamp(0.8rem, 2.5cqw, 2rem)' }}
              >
                {occupiedBays} / {bayZones.length}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-3 3xl:gap-4 flex-1 min-h-0 auto-rows-fr">
            <AnimatePresence>
              {bayZones.map((zone: Zone) => renderZoneCard(zone, false))}
            </AnimatePresence>
          </div>
        </div>

        {/* Parking Lot Area */}
        {parkingZones.length > 0 && (
          <div className="w-[200px] lg:w-[280px] 3xl:w-[500px] shrink-0 flex flex-col border-l border-zinc-900 pl-2 lg:pl-4 3xl:pl-8 overflow-hidden">
            <div className="flex items-center justify-between mb-2 3xl:mb-4">
              <h3 
                className="font-black uppercase tracking-[0.2em] text-zinc-500"
                style={{ fontSize: 'clamp(0.8rem, 3cqw, 2.5rem)' }}
              >
                Lot
              </h3>
              <div className="flex items-center gap-2 3xl:gap-4 bg-zinc-900 border border-zinc-800 px-3 py-1 3xl:px-4 3xl:py-2 rounded-lg 3xl:rounded-xl shadow-lg">
                <span 
                  className="text-white font-black"
                  style={{ fontSize: 'clamp(0.8rem, 2.5cqw, 2rem)' }}
                >
                  {occupiedParking} / {parkingZones.length}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
              <div className="grid grid-cols-2 gap-1.5 lg:gap-2 3xl:gap-3 auto-rows-[minmax(40px,1fr)] 2xl:auto-rows-[minmax(60px,1fr)] 3xl:auto-rows-[minmax(100px,1fr)]">
                <AnimatePresence>
                  {parkingZones.map((zone: Zone) => renderZoneCard(zone, true))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
