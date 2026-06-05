import React, { useState, useEffect } from 'react';
import { 
  LogIn, LogOut, Pizza, Coffee, Play, Clock, 
  QrCode, MapPin, Power, CheckCircle, ShieldAlert, RefreshCw
} from 'lucide-react';

export interface Slide {
  title: string;
  subtitle?: string;
  visualElement?: React.ReactNode;
  bulletPoints: string[];
  tips?: string[];
}

export interface SlideTutorial {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  estimatedTime: string;
  version: string;
  slides: Slide[];
}

// =========================================================================
// 🎮 INTERACTIVE MOCKUPS FOR POWERPOINT SLIDES
// =========================================================================

export function InteractiveClockInMockup() {
  const [status, setStatus] = useState<'out' | 'in'>('out');
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: any;
    if (status === 'in') {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden select-none">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg transition-colors border ${
            status === 'out' ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-emerald-500/10 text-emerald-505 border-emerald-500/20'
          }`}>
            <Power className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">Status</p>
            <p className="text-xs text-zinc-400 font-bold mt-1 capitalize">{status === 'out' ? 'Clocked Out' : 'Clocked In'}</p>
          </div>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full transition-colors ${status === 'out' ? 'bg-zinc-650' : 'bg-emerald-550 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`} />
      </div>
      
      <div className="my-6 flex flex-col items-center justify-center gap-3">
        {status === 'out' ? (
          <button
            type="button"
            onClick={() => setStatus('in')}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl flex items-center gap-3 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all cursor-pointer font-extrabold text-sm uppercase tracking-wider"
          >
            <LogIn className="w-5 h-5" />
            <span>Clock In</span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-xl font-black text-indigo-400 tabular-nums animate-pulse">
              {formatTime(timer)}
            </span>
            <button
              type="button"
              onClick={() => setStatus('out')}
              className="px-4 py-2 bg-rose-650 hover:bg-rose-700 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-rose-500/15 active:scale-95 transition-all cursor-pointer font-bold text-xs uppercase tracking-wide"
            >
              <LogOut className="w-4 h-4" />
              <span>Reset Mockup</span>
            </button>
          </div>
        )}
        <p className="text-[10px] text-zinc-500 font-semibold text-center leading-normal px-2">
          {status === 'out' ? 'Click Clock In to simulate starting your shift' : 'Simulated timer is now tracking your work hours!'}
        </p>
      </div>
      
      <div className="text-[9px] text-zinc-500 font-bold border-t border-zinc-900 pt-3 flex justify-between">
        <span>Shift Time: {status === 'in' ? 'Active' : '--:--:--'}</span>
        <span>Off-site: Not Allowed</span>
      </div>
    </div>
  );
}

export function InteractiveQRScanMockup() {
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'scanned' | 'expired'>('idle');
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    let interval: any;
    if (scanState === 'scanned') {
      interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            setScanState('expired');
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(60);
    }
    return () => clearInterval(interval);
  }, [scanState]);

  const handleScan = () => {
    setScanState('scanning');
    setTimeout(() => {
      setScanState('scanned');
    }, 1500);
  };

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none">
      <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
          <QrCode className="w-4 h-4" />
        </div>
        <h4 className="text-xs font-bold text-white">Live Rotating Security QR</h4>
      </div>
      
      <div className="my-4 flex flex-col items-center justify-center gap-4">
        {scanState === 'idle' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 bg-white p-1.5 rounded-xl flex items-center justify-center relative shadow-xl">
              <QrCode className="w-16 h-16 text-black" />
            </div>
            <button
              type="button"
              onClick={handleScan}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-95 transition-all cursor-pointer"
            >
              Simulate QR Scan
            </button>
          </div>
        )}

        {scanState === 'scanning' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 bg-white p-1.5 rounded-xl flex items-center justify-center relative overflow-hidden shadow-xl animate-pulse">
              <QrCode className="w-16 h-16 text-black opacity-20" />
              <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
                <div className="w-full h-0.5 bg-indigo-500 shadow-md shadow-indigo-500/50 absolute top-0 animate-[bounce_1.5s_infinite]" />
                <span className="text-[8px] font-black text-indigo-400 bg-zinc-950/80 px-1 py-0.5 rounded border border-indigo-500/20">SCANNING</span>
              </div>
            </div>
            <span className="text-[10px] text-zinc-550 font-bold animate-pulse">Accessing mobile camera...</span>
          </div>
        )}

        {scanState === 'scanned' && (
          <div className="flex flex-col items-center gap-3 w-full px-2">
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl w-full">
              <CheckCircle className="w-4 h-4 text-emerald-550 shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Token Secured</p>
                <p className="text-[9px] text-zinc-400 font-semibold truncate leading-none mt-0.5">ID: UF_SEC_98A2F</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-semibold text-zinc-450">Token expires in:</span>
              <span className="font-mono text-xs font-black text-white bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">{countdown}s</span>
            </div>
            <button
              type="button"
              onClick={() => setScanState('idle')}
              className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-350 rounded-lg text-[9px] font-bold uppercase cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}

        {scanState === 'expired' && (
          <div className="flex flex-col items-center gap-3 w-full px-2">
            <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl w-full">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" />
              <div className="text-left min-w-0">
                <p className="text-[9px] text-rose-450 font-bold uppercase tracking-wider">Token Expired</p>
                <p className="text-[9px] text-zinc-405 font-semibold leading-normal mt-0.5">Please rescan the tablet's live rotating code.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleScan}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              Rescan QR
            </button>
          </div>
        )}
      </div>
      
      <div className="border-t border-zinc-900 pt-3 text-[9px] text-zinc-500 font-bold text-center">
        Explain: QR code rotates constantly for security.
      </div>
    </div>
  );
}

export function InteractiveGeofenceMockup() {
  const [locationType, setLocationType] = useState<'onsite' | 'offsite'>('onsite');

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/5 rounded-full border border-indigo-500/10 pointer-events-none" />
      
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-505" />
          Geofence Map View
        </span>
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
          locationType === 'onsite' ? 'bg-emerald-500/10 text-emerald-450' : 'bg-rose-500/10 text-rose-400'
        }`}>
          {locationType === 'onsite' ? 'Inside' : 'Outside'}
        </span>
      </div>
      
      <div className="my-3 flex flex-col items-center justify-center relative">
        <div className="w-44 h-20 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center overflow-hidden relative">
          {/* Geofence Ring */}
          <div className="w-20 h-20 rounded-full border-2 border-dashed border-indigo-500/20 bg-indigo-500/5 flex items-center justify-center">
            {/* Shop dot */}
            <div className="w-2 h-2 bg-indigo-550 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
          </div>
          
          {/* Tech location dot */}
          <div className={`absolute transition-all duration-700 flex flex-col items-center ${
            locationType === 'onsite' ? 'top-8 left-18' : 'top-3 left-4'
          }`}>
            <MapPin className={`w-3.5 h-3.5 filter drop-shadow ${locationType === 'onsite' ? 'text-emerald-400' : 'text-rose-505'}`} />
            <span className="bg-zinc-950 text-white border border-zinc-850 px-1 py-0.5 rounded text-[6px] font-black uppercase mt-0.5">YOU</span>
          </div>
        </div>

        <div className="flex gap-2 mt-3 w-full">
          <button
            type="button"
            onClick={() => setLocationType('onsite')}
            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95 ${
              locationType === 'onsite' 
                ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/30 font-black shadow-sm' 
                : 'bg-zinc-900 text-zinc-550 border-zinc-800'
            }`}
          >
            Go On-Site
          </button>
          <button
            type="button"
            onClick={() => setLocationType('offsite')}
            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95 ${
              locationType === 'offsite' 
                ? 'bg-rose-500/10 text-rose-450 border-rose-500/30 font-black shadow-sm' 
                : 'bg-zinc-900 text-zinc-550 border-zinc-800'
            }`}
          >
            Go Off-Site
          </button>
        </div>
      </div>

      <div className="border-t border-zinc-900 pt-3 text-[9px] text-zinc-550 font-bold text-center">
        {locationType === 'onsite' ? (
          <span className="text-emerald-400">On-Site (Within geofence) • Allowed</span>
        ) : (
          <span className="text-rose-405">Off-Site (Distance: 8.4km) • Blocked</span>
        )}
      </div>
    </div>
  );
}

export function InteractiveClockOutMockup() {
  const [state, setState] = useState<'active' | 'submitting' | 'submitted'>('active');

  const handleSubmit = () => {
    setState('submitting');
    setTimeout(() => {
      setState('submitted');
    }, 1500);
  };

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          Shift Status
        </span>
        <span className={`text-[10px] font-black uppercase tracking-wider ${
          state === 'active' ? 'text-indigo-400 animate-pulse' : state === 'submitting' ? 'text-zinc-500' : 'text-emerald-500'
        }`}>
          {state === 'active' ? 'Active Shift' : state === 'submitting' ? 'Saving...' : 'Completed'}
        </span>
      </div>
      
      <div className="my-4 flex flex-col items-center justify-center gap-3">
        {state === 'active' && (
          <div className="flex flex-col items-center gap-3 w-full">
            <span className="font-mono text-xl font-black text-zinc-300 tabular-nums">08:04:12</span>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-750 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Clock Out Shift
            </button>
          </div>
        )}

        {state === 'submitting' && (
          <div className="flex flex-col items-center gap-2.5 py-1">
            <RefreshCw className="w-7 h-7 text-indigo-500 animate-spin" />
            <span className="text-[9px] text-zinc-550 font-bold uppercase tracking-wider">Saving timecard logs...</span>
          </div>
        )}

        {state === 'submitted' && (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl w-full">
              <CheckCircle className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-[9px] text-emerald-450 font-bold uppercase tracking-wider">Shift Saved</p>
                <p className="text-[9px] text-zinc-400 font-semibold mt-0.5 leading-none">Net Hours: 7.57h</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setState('active')}
              className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-350 rounded-lg text-[9px] font-bold uppercase cursor-pointer"
            >
              Simulate Again
            </button>
          </div>
        )}
      </div>
      
      <div className="text-[9px] text-zinc-500 font-bold border-t border-zinc-900 pt-3 flex justify-between">
        <span>Gross: 8.07h</span>
        <span>Lunch/Breaks: 30m</span>
      </div>
    </div>
  );
}

export function InteractiveBreakStartMockup() {
  const [breakType, setBreakType] = useState<'working' | 'lunch' | 'break'>('working');
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: any;
    if (breakType !== 'working') {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [breakType]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          {breakType === 'working' ? (
            <>
              <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
              Active Shift
            </>
          ) : breakType === 'lunch' ? (
            <>
              <Pizza className="w-4 h-4 text-amber-500 animate-bounce" />
              On Lunch Break
            </>
          ) : (
            <>
              <Coffee className="w-4 h-4 text-amber-500 animate-bounce" />
              On Rest Break
            </>
          )}
        </span>
        <span className={`font-mono text-xs font-black tabular-nums ${
          breakType === 'working' ? 'text-emerald-400' : 'text-amber-500'
        }`}>
          {breakType === 'working' ? '04:32:15' : formatTime(timer)}
        </span>
      </div>
      
      <div className="my-4 flex items-center justify-center gap-3">
        {breakType === 'working' ? (
          <>
            <button
              type="button"
              onClick={() => setBreakType('lunch')}
              className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-xl flex items-center gap-2 cursor-pointer transition-all border border-amber-500/20 active:scale-95 text-xs font-bold uppercase tracking-wide"
            >
              <Pizza className="w-4 h-4" /> Lunch
            </button>
            <button
              type="button"
              onClick={() => setBreakType('break')}
              className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-xl flex items-center gap-2 cursor-pointer transition-all border border-amber-500/20 active:scale-95 text-xs font-bold uppercase tracking-wide"
            >
              <Coffee className="w-4 h-4" /> Break
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setBreakType('working')}
            className="px-5 py-2.5 bg-indigo-650 hover:bg-indigo-755 text-white rounded-xl flex items-center gap-2 shadow-md active:scale-95 cursor-pointer text-xs font-bold uppercase tracking-wide transition-all"
          >
            <Play className="w-4 h-4" /> Resume Work
          </button>
        )}
      </div>
      
      <div className="border-t border-zinc-900 pt-3 text-[9px] text-zinc-550 font-bold text-center">
        {breakType === 'working' ? 'Tap Lunch or Break to start rest period' : 'Simulating paused shift attendance time'}
      </div>
    </div>
  );
}

export function InteractiveJobSuspensionMockup() {
  const [isSuspended, setIsSuspended] = useState(false);

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/[0.02] rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          Shift Status
        </span>
        <span className={`text-[10px] font-black uppercase tracking-wider ${
          isSuspended ? 'text-amber-500' : 'text-emerald-500 animate-pulse'
        }`}>
          {isSuspended ? 'Paused (On Break)' : 'Active (Working)'}
        </span>
      </div>
      
      <div className="my-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-850 space-y-2.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400">
          <span>Active Task Timer</span>
          <span className={`uppercase tracking-tighter ${isSuspended ? 'text-amber-505 font-extrabold' : 'text-emerald-500'}`}>
            {isSuspended ? 'Suspended' : 'Running'}
          </span>
        </div>
        <p className="text-xs font-black text-white truncate">Job #1024 - 2024 Ford F-150 Lift Kit</p>
        <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
          <div className={`h-full w-2/3 transition-all duration-500 ${
            isSuspended ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
          }`} />
        </div>
      </div>

      <div className="flex gap-2 w-full">
        <button
          type="button"
          onClick={() => setIsSuspended(true)}
          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95 ${
            isSuspended 
              ? 'bg-amber-500/10 text-amber-450 border-amber-500/30' 
              : 'bg-zinc-900 text-zinc-550 border-zinc-800 hover:text-zinc-350'
          }`}
        >
          Pause (Break)
        </button>
        <button
          type="button"
          onClick={() => setIsSuspended(false)}
          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95 ${
            !isSuspended 
              ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/30' 
              : 'bg-zinc-900 text-zinc-550 border-zinc-800 hover:text-zinc-350'
          }`}
        >
          Resume Work
        </button>
      </div>
      
      <div className="border-t border-zinc-900 pt-3 text-[9px] text-zinc-550 font-bold text-center">
        Job progress is paused automatically on breaks to preserve flat-rate labor metrics.
      </div>
    </div>
  );
}

export function InteractiveResumeMockup() {
  const [state, setState] = useState<'suspended' | 'resuming' | 'active'>('suspended');
  const [timer, setTimer] = useState(1800); // 30 minutes in seconds

  useEffect(() => {
    let interval: any;
    if (state === 'suspended') {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      setTimer(1800);
    }
    return () => clearInterval(interval);
  }, [state]);

  const handleResume = () => {
    setState('resuming');
    setTimeout(() => {
      setState('active');
    }, 1500);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400 animate-pulse" />
          {state === 'suspended' ? 'Break Completed' : state === 'resuming' ? 'Resuming...' : 'Job Active'}
        </span>
        <span className="font-mono text-xs font-black text-indigo-400">
          {state === 'suspended' ? formatTime(timer) : state === 'resuming' ? '--:--' : '04:32:16'}
        </span>
      </div>
      
      <div className="my-5 flex flex-col items-center justify-center gap-3">
        {state === 'suspended' && (
          <button
            type="button"
            onClick={handleResume}
            className="px-6 py-3 bg-indigo-650 hover:bg-indigo-755 text-white rounded-2xl flex items-center gap-3 shadow-lg shadow-indigo-500/25 animate-pulse cursor-pointer text-xs font-bold uppercase tracking-wider transition-all"
          >
            <Play className="w-5 h-5" />
            <span>Resume Work</span>
          </button>
        )}

        {state === 'resuming' && (
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="w-7 h-7 text-indigo-500 animate-spin" />
            <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Restoring job session...</span>
          </div>
        )}

        {state === 'active' && (
          <div className="flex flex-col items-center gap-2 w-full text-center">
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl w-full">
              <CheckCircle className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-[9px] text-emerald-450 font-bold uppercase tracking-wider">Shift & Job Resumed</p>
                <p className="text-[9px] text-zinc-400 font-semibold mt-0.5">Job: #1024 - Ford F-150 Lift Kit</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setState('suspended')}
              className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-350 rounded-lg text-[9px] font-bold uppercase cursor-pointer"
            >
              Simulate Break Again
            </button>
          </div>
        )}
      </div>
      
      <div className="border-t border-zinc-900 pt-3 text-[9px] text-zinc-555 font-bold text-center font-semibold">
        {state === 'suspended' ? 'Click Resume Work to simulate returning' : 'Platform automatically clocked you back into task!'}
      </div>
    </div>
  );
}

// =========================================================================
// 📚 SLIDES TUTORIALS DEFINITIONS
// =========================================================================

export const SLIDE_TUTORIALS: SlideTutorial[] = [
  {
    id: "clocking_in_out",
    title: "Mastering Clocking In & Out",
    description: "A complete step-by-step slideshow on starting your shift, resolving security scans, and completing your workday.",
    icon: LogIn,
    estimatedTime: "3 mins",
    version: "1.0",
    slides: [
      {
        title: "Welcome to UpfittersOS Time Clock",
        subtitle: "Step 1 of 4: The Attendance Hub",
        bulletPoints: [
          "Accurate time tracking is the foundation of our payroll and shop planning.",
          "Your shift attendance is logged using the global Time Clock Bar at the top of your dashboard.",
          "This bar is always visible, keeping your current status and work timer in view at all times."
        ],
        tips: [
          "Check your timecard status regularly on your dashboard's Time Clock submenu.",
          "Ensure you are in the correct shop mode when clocking in."
        ],
        visualElement: <InteractiveClockInMockup />
      },
      {
        title: "Scanning the Live Rotating QR Code",
        subtitle: "Step 2 of 4: Security Verification",
        bulletPoints: [
          "To prevent offsite check-ins, the shop may enforce QR scans.",
          "You must scan the live, rotating QR code displayed on the physical tablet or screen on the shop floor.",
          "Once scanned, the security token is saved on your device and is valid for exactly 60 seconds."
        ],
        tips: [
          "The QR code rotates constantly for security; bookmarking or sharing the URL will make it expire.",
          "If the monitor says offline, request your shop manager to refresh the tablet."
        ],
        visualElement: <InteractiveQRScanMockup />
      },
      {
        title: "Location Gating & Geofencing",
        subtitle: "Step 3 of 4: Physical Shop Check-in",
        bulletPoints: [
          "The platform utilizes your device's native GPS to confirm your presence on-site.",
          "Clocking in is restricted to the shop's physical boundary (geofence), typically a 500m radius.",
          "You must grant location permissions to your browser or mobile phone when prompted."
        ],
        tips: [
          "If you have off-site jobs (e.g. mobile service), confirm your supervisor has enabled 'Off-site clock-in' on your profile.",
          "If GPS fails, ensure Wi-Fi is enabled to help pinpoint your position."
        ],
        visualElement: <InteractiveGeofenceMockup />
      },
      {
        title: "Completing Your Shift (Clock Out)",
        subtitle: "Step 4 of 4: Leaving For The Day",
        bulletPoints: [
          "At the end of your shift, click the red Clock Out button in the top bar.",
          "Clocking out stops your attendance record and calculates your final net hours for the day.",
          "If you are currently active on a job task, clocking out will automatically end your task session too."
        ],
        tips: [
          "Never leave the shop floor without clocking out; missing clock-outs generate anomalies for managers to review.",
          "Double-check your total pay period hours in your Time Clock log page to ensure accuracy."
        ],
        visualElement: <InteractiveClockOutMockup />
      }
    ]
  },
  {
    id: "breaks_lunches",
    title: "Logging Breaks & Lunch Compliance",
    description: "Learn how to start and end rest breaks, manage lunch clock-outs, and understand job suspension rules.",
    icon: Pizza,
    estimatedTime: "3 mins",
    version: "1.0",
    slides: [
      {
        title: "Starting a Rest Break or Lunch",
        subtitle: "Step 1 of 3: Taking a Pause",
        bulletPoints: [
          "Taking breaks keeps your records accurate and prevents billing issues on payroll.",
          "When you are clocked in, click either the Lunch or Break button on the top timeclock bar.",
          "The system will transition your status and update the timer to track break duration."
        ],
        tips: [
          "Lunches are typically unpaid rest periods, while breaks may be paid or unpaid depending on your shop policy.",
          "Ensure you click the actual break buttons rather than clocking out completely for short rest breaks."
        ],
        visualElement: <InteractiveBreakStartMockup />
      },
      {
        title: "Automated Job Timer Suspension",
        subtitle: "Step 2 of 3: Suspended State",
        bulletPoints: [
          "When you start a break or lunch, any active job task you are currently clocked into will be suspended.",
          "UpfittersOS automatically records the exact timestamp of the suspension so no extra labor time is incorrectly booked.",
          "Your shift timer changes status, and a break timer starts to track your break duration."
        ],
        visualElement: <InteractiveJobSuspensionMockup />
      },
      {
        title: "Ending Breaks & Automatic Resumption",
        subtitle: "Step 3 of 3: Back to Work",
        bulletPoints: [
          "When you are ready to work, click the Resume Work button in the top bar.",
          "This action will end your break, close your break session, and resume your shift timer.",
          "Any suspended job task will automatically restart, clocking you back into the job without manual inputs!"
        ],
        tips: [
          "Be sure to click Resume immediately when returning to the shop floor to prevent billing gaps.",
          "If you need to change jobs, you can clock into a different task from the Job Details page."
        ],
        visualElement: <InteractiveResumeMockup />
      }
    ]
  }
];
