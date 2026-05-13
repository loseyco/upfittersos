import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, limit, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Maximize, Minimize, AlertTriangle, ShoppingCart } from 'lucide-react';
import _QRCode from 'react-qr-code';
import { cn } from '../../lib/utils';
import { Toaster } from 'sonner';
import type { Zone } from './ZoneModals';

const QRCode = (_QRCode as any).default || _QRCode;
import type { Vehicle } from './VehicleSelector';

export function BayMonitor({ tenantId }: { tenantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [businessName, setBusinessName] = useState('UPFITTERS OS');

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

  const renderZoneCard = (zone: Zone, isCompact: boolean = false) => {
    const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
    const job = jobs.find((j: any) => j.id === zone.currentJobId);
    
    const target = job || zone;
    const legacyBlocker = target?.blocker ? [{ message: target.blocker, status: 'active' }] : [];
    const activeBlockers = (target?.blockers || legacyBlocker).filter((b: any) => b.status === 'active');
    const isBlocked = activeBlockers.length > 0;

    const currentVin = job?.vehicleVin || zone?.currentVehicleVin;
    const relevantParts = partsRequests.filter((pr: any) => {
      const status = (pr.status || '').toLowerCase();
      const isActive = ['pending', 'received', 'ordered'].includes(status);
      if (!isActive) return false;
      if (job?.id && pr.jobId === job.id) return true;
      if (zone?.id && pr.zoneId === zone.id) return true;
      if (currentVin && pr.vin === currentVin) return true;
      return false;
    });
    const partsArrived = relevantParts.some(pr => (pr.status || '').toLowerCase() === 'received');

    const etaRaw = job?.expectedFinishTime || job?.eta || zone.eta;
    let isOverdue = false;
    let timeLabel = '';
    let etaDate: Date | null = null;
    if (etaRaw) {
      const parsedDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
      etaDate = parsedDate;
      const diffMs = parsedDate.getTime() - now;
      isOverdue = diffMs < 0;
      const absDiff = Math.abs(diffMs);
      const days = Math.floor(absDiff / 86400000);
      const hours = Math.floor((absDiff % 86400000) / 3600000);
      const minutes = Math.floor((absDiff % 3600000) / 60000);
      timeLabel = days > 0 ? `${days}d ${hours}h` : (hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    }

    const hasVehicle = !!currentVin;

    // Determine card color based on priority
    let cardBg = "bg-zinc-900 border-zinc-800";
    let textColor = "text-white";
    
    if (isBlocked) {
      cardBg = "bg-red-950/80 border-red-900/50";
      textColor = "text-red-100";
    } else if (partsArrived) {
      cardBg = "bg-emerald-950/80 border-emerald-900/50";
      textColor = "text-emerald-100";
    } else if (hasVehicle && isOverdue) {
      cardBg = "bg-amber-950/80 border-amber-900/50";
      textColor = "text-amber-100";
    } else if (hasVehicle) {
      cardBg = "bg-indigo-950/80 border-indigo-900/50";
      textColor = "text-indigo-100";
    } else {
      cardBg = "bg-zinc-900/50 border-zinc-800/50 opacity-50";
      textColor = "text-zinc-500";
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

    const lastUpdated = () => {
      const timestamp = job?.updatedAt || zone.updatedAt || zone.createdAt;
      if (!timestamp) return 'Never';
      let date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp.seconds ? timestamp.seconds * 1000 : timestamp);
      if (isNaN(date.getTime())) return 'Never';
      const diff = Math.floor((now - date.getTime()) / 1000);
      if (diff < 60) return 'Just now';
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      if (hours > 24) return `${Math.floor(hours/24)}d ago`;
      if (hours > 0) return `${hours}h ago`;
      return `${minutes}m ago`;
    };

    if (isCompact) {
      return (
        <div key={zone.id} className={cn("relative rounded-lg border flex flex-col justify-between transition-all duration-1000 min-h-0 overflow-hidden p-2 3xl:p-3", cardBg)}>
          
          <div className="flex items-start justify-between shrink-0 min-h-0">
            <div className="flex-1 min-w-0 pr-2">
              {hasVehicle ? (
                <div className="text-[11px] 2xl:text-sm 3xl:text-2xl font-bold text-white line-clamp-2 leading-tight">
                  {vehicle?.year || ''} {vehicle?.make || 'Unknown'} {vehicle?.model || 'Vehicle'}
                </div>
              ) : (
                <div className="text-[10px] 2xl:text-xs 3xl:text-xl font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                  Empty
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-0.5 shrink-0 z-10">
              {isBlocked && (
                <div className="bg-red-500 text-white px-1 py-0.5 rounded-[2px] text-[7px] 3xl:text-[10px] font-black uppercase tracking-widest flex items-center animate-pulse leading-none mt-0.5">
                   Block
                </div>
              )}
              {partsArrived && !isBlocked && (
                <div className="bg-emerald-500 text-white px-1 py-0.5 rounded-[2px] text-[7px] 3xl:text-[10px] font-black uppercase tracking-widest flex items-center leading-none mt-0.5">
                   Parts
                </div>
              )}
            </div>
          </div>

          <div className="flex items-end justify-between mt-2 shrink-0">
            <h2 className={cn("text-[10px] 2xl:text-xs 3xl:text-xl font-bold tracking-tight truncate pr-2 opacity-75", textColor)}>
              {zone.name}
            </h2>
            {hasVehicle && (
              <div className="shrink-0 text-[8px] 3xl:text-[14px] text-white/50 font-black tracking-widest bg-black/40 px-1.5 py-0.5 rounded">
                {timeInArea()}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={zone.id} className={cn("@container rounded-3xl p-[max(1rem,3cqw)] border-4 flex flex-col transition-all duration-1000 min-h-0 overflow-hidden", cardBg)}>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-start justify-between mb-[max(0.5rem,2cqw)]">
            <h2 className={cn("text-[max(1.25rem,8cqw)] font-black tracking-tight line-clamp-2 leading-none", textColor)}>{zone.name}</h2>
            <div className="flex flex-col items-end gap-[max(0.25rem,1cqw)] shrink-0 ml-2">
              {isBlocked && (
                <div className="bg-red-500 text-white px-[max(0.5rem,1.5cqw)] py-[max(0.25rem,1cqw)] rounded-lg text-[max(0.6rem,2cqw)] font-black uppercase tracking-widest flex items-center gap-[max(0.25rem,1cqw)] animate-pulse">
                  <AlertTriangle className="w-[max(0.75rem,2.5cqw)] h-[max(0.75rem,2.5cqw)]" /> Blocked
                </div>
              )}
              {partsArrived && !isBlocked && (
                <div className="bg-emerald-500 text-white px-[max(0.5rem,1.5cqw)] py-[max(0.25rem,1cqw)] rounded-lg text-[max(0.6rem,2cqw)] font-black uppercase tracking-widest flex items-center gap-[max(0.25rem,1cqw)]">
                  <ShoppingCart className="w-[max(0.75rem,2.5cqw)] h-[max(0.75rem,2.5cqw)]" /> Parts
                </div>
              )}
            </div>
          </div>

          {hasVehicle ? (
            <div className="flex-1 min-h-0 flex flex-col justify-center mb-[max(0.5rem,2cqw)]">
              <div className="text-[max(1.25rem,7cqw)] font-bold text-white truncate leading-tight mb-[max(0.25rem,1cqw)]">
                {vehicle?.year || ''} {vehicle?.make || 'Unknown'} {vehicle?.model || 'Vehicle'}
              </div>
              {job?.title && (
                <div className={cn("text-[max(1rem,4.5cqw)] font-medium line-clamp-2 leading-tight mb-[max(0.25rem,1cqw)]", textColor, "opacity-90")}>
                  {job.title}
                </div>
              )}
              <div className="text-[max(0.75rem,3cqw)] font-bold uppercase tracking-widest text-white/50 truncate leading-none">
                {job?.customerName || vehicle?.customerName || 'No Customer Info'}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex items-center text-[max(1.25rem,7cqw)] font-bold text-zinc-600">
              Empty Bay
            </div>
          )}
        </div>

        {hasVehicle && (
          <div className="pt-[max(0.5rem,2cqw)] border-t-2 border-white/10 shrink-0 grid grid-cols-2 gap-[max(0.5rem,2cqw)]">
            <div className="flex flex-col">
              <span className="font-bold uppercase tracking-widest text-white/40 text-[max(0.6rem,2cqw)] leading-none mb-[max(0.25rem,1cqw)]">Time in Bay</span>
              <span className="font-black text-white/90 text-[max(0.875rem,3.5cqw)] leading-none truncate">{timeInArea()}</span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold uppercase tracking-widest text-white/40 text-[max(0.6rem,2cqw)] leading-none mb-[max(0.25rem,1cqw)]">Last Update</span>
              <span className="font-black text-white/90 text-[max(0.875rem,3.5cqw)] leading-none truncate">{lastUpdated()}</span>
            </div>
            
            {etaDate && (
              <>
                <div className="flex flex-col">
                  <span className="font-bold uppercase tracking-widest text-white/40 text-[max(0.6rem,2cqw)] leading-none mb-[max(0.25rem,1cqw)]">ETA Date</span>
                  <span className="font-black text-white/90 text-[max(0.875rem,3.5cqw)] leading-none truncate">{etaDate.toLocaleDateString()} {etaDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-bold uppercase tracking-widest text-white/40 text-[max(0.6rem,2cqw)] leading-none mb-[max(0.25rem,1cqw)]">Countdown</span>
                  <span className={cn("font-black tracking-widest text-[max(0.875rem,3.5cqw)] leading-none truncate", isOverdue ? "text-red-400 animate-pulse" : "text-emerald-400")}>
                    {isOverdue ? `-${timeLabel}` : timeLabel}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen bg-black text-white p-4 md:p-6 lg:p-8 3xl:p-8 relative overflow-hidden flex flex-col">
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
            <div className="flex items-center gap-2 3xl:gap-4 bg-zinc-900/50 px-3 py-1.5 3xl:px-6 3xl:py-3 rounded-lg 3xl:rounded-2xl border border-zinc-800">
              <div className="w-2 h-2 3xl:w-4 3xl:h-4 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
              <span className="text-zinc-400 text-xs 2xl:text-sm 3xl:text-[30px] font-black uppercase tracking-widest leading-none">LIVE</span>
            </div>
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
            className="p-3 3xl:p-6 bg-zinc-900 hover:bg-zinc-800 rounded-xl 3xl:rounded-2xl transition-colors text-zinc-400 hover:text-white shrink-0 ml-2 3xl:ml-4 border border-zinc-800"
          >
            {isFullscreen ? <Minimize className="w-6 h-6 3xl:w-10 3xl:h-10" /> : <Maximize className="w-6 h-6 3xl:w-10 3xl:h-10" />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 lg:gap-8 3xl:gap-4">
        {/* Main Bays Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6 3xl:gap-4 flex-1 min-h-0 auto-rows-fr">
            {bayZones.map(zone => renderZoneCard(zone, false))}
          </div>
        </div>

        {/* Parking Lot Area */}
        {parkingZones.length > 0 && (
          <div className="w-[280px] lg:w-[350px] 3xl:w-[600px] shrink-0 flex flex-col border-l-4 border-zinc-900 pl-4 lg:pl-8 3xl:pl-12 overflow-hidden">
            <h3 className="text-lg lg:text-xl 3xl:text-[54px] font-black uppercase tracking-widest text-zinc-500 mb-4 3xl:mb-4 shrink-0">Parking / Staging</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
              <div className="grid grid-cols-2 gap-2 lg:gap-3 3xl:gap-4 auto-rows-[minmax(60px,1fr)] 2xl:auto-rows-[minmax(80px,1fr)] 3xl:auto-rows-[minmax(120px,1fr)]">
                {parkingZones.map(zone => renderZoneCard(zone, true))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
