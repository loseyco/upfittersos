import React, { useState, useEffect } from 'react';
import { 
  Car, Wrench, ShieldCheck, PenTool, Layers, Flame, 
  CheckCircle2, AlertTriangle, AlertCircle, Sparkles, Paintbrush, RefreshCw, Info, Lock
} from 'lucide-react';

export interface SOPSlide {
  title: string;
  subtitle?: string;
  visualElement?: React.ReactNode;
  bulletPoints: string[];
  tips?: string[];
}

export interface SOP {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  estimatedTime: string;
  slides: SOPSlide[];
}

export interface SOPStep {
  id: string;
  title: string;
  instructions: string;
  type: 'standard' | 'conditional' | 'input';
  assigneeType: 'anyone' | 'department' | 'staff';
  assignedDepartmentId?: string;
  assignedStaffId?: string;
  choices?: { label: string; nextStepId: string }[];
  inputs?: { label: string; type: 'text' | 'date' | 'checkbox'; required: boolean }[];
}

export interface SOPRun {
  id?: string;
  sopId: string;
  title: string;
  linkedJobId?: string;
  status: 'active' | 'completed';
  currentStepId: string;
  startedAt: number;
  startedBy: string;
  startedByName: string;
  completedAt?: number;
  history: {
    stepId: string;
    title: string;
    completedAt: number;
    completedBy: string;
    completedByName: string;
    choiceSelected?: string;
    inputsData?: Record<string, any>;
  }[];
}

export interface SOPTemplate {
  id?: string;
  title: string;
  description: string;
  category: 'company' | 'department';
  departmentId?: string;
  steps: SOPStep[];
  version?: number;
  createdAt: number;
}

// =========================================================================
// 🚗 INTERACTIVE MOCKUP: VEHICLE INTAKE INSPECTION
// =========================================================================

type DamageLevel = 'OK' | 'Scratch' | 'Dent' | 'Cracked';

interface ZoneState {
  id: string;
  label: string;
  status: DamageLevel;
  notes: string;
}

export function VehicleIntakeMockup() {
  const [zones, setZones] = useState<ZoneState[]>([
    { id: 'front_bumper', label: 'Front Bumper', status: 'OK', notes: '' },
    { id: 'windshield', label: 'Windshield', status: 'OK', notes: '' },
    { id: 'left_side', label: 'Left Panels', status: 'OK', notes: '' },
    { id: 'right_side', label: 'Right Panels', status: 'OK', notes: '' },
    { id: 'roof', label: 'Cab / Roof', status: 'OK', notes: '' },
    { id: 'tailgate', label: 'Tailgate / Bed', status: 'OK', notes: '' },
  ]);

  const [activeZone, setActiveZone] = useState<string | null>(null);

  const cycleStatus = (id: string) => {
    setZones(prev => prev.map(zone => {
      if (zone.id !== id) return zone;
      const statuses: DamageLevel[] = ['OK', 'Scratch', 'Dent', 'Cracked'];
      const nextIdx = (statuses.indexOf(zone.status) + 1) % statuses.length;
      return { ...zone, status: statuses[nextIdx] };
    }));
  };

  const updateNotes = (id: string, notes: string) => {
    setZones(prev => prev.map(zone => {
      if (zone.id !== id) return zone;
      return { ...zone, notes };
    }));
  };

  const getStatusColor = (status: DamageLevel) => {
    switch (status) {
      case 'OK': return 'fill-emerald-500/20 stroke-emerald-500 dark:fill-emerald-500/10 dark:stroke-emerald-400';
      case 'Scratch': return 'fill-amber-500/40 stroke-amber-500 dark:fill-amber-500/20 dark:stroke-amber-400';
      case 'Dent': return 'fill-rose-500/40 stroke-rose-500 dark:fill-rose-500/20 dark:stroke-rose-450';
      case 'Cracked': return 'fill-red-650/50 stroke-red-600 dark:fill-red-650/30 dark:stroke-red-400';
    }
  };

  const getStatusBadge = (status: DamageLevel) => {
    switch (status) {
      case 'OK': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'Scratch': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'Dent': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      case 'Cracked': return 'bg-red-500/10 text-red-500 border-red-500/20';
    }
  };

  const damageLogs = zones.filter(z => z.status !== 'OK');

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative overflow-y-auto no-scrollbar select-none text-white max-h-[420px]">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold flex items-center gap-2">
          <Car className="w-4 h-4 text-indigo-400" />
          Interactive Intake Damage Mapper
        </span>
        <span className="text-[9px] text-zinc-500 font-bold">Tap zones to mark damage</span>
      </div>

      <div className="my-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* SVG Truck Map */}
        <div className="flex justify-center relative">
          <svg viewBox="0 0 240 120" className="w-full max-w-[200px] h-auto">
            {/* Cab / Roof */}
            <path 
              d="M 80 40 L 140 40 L 145 70 L 75 70 Z" 
              className={`cursor-pointer transition-colors duration-200 stroke-2 ${getStatusColor(zones.find(z => z.id === 'roof')!.status)}`}
              onClick={() => { cycleStatus('roof'); setActiveZone('roof'); }}
            />
            {/* Windshield */}
            <path 
              d="M 60 70 L 75 70 L 80 40 L 60 40 Z" 
              className={`cursor-pointer transition-colors duration-200 stroke-2 ${getStatusColor(zones.find(z => z.id === 'windshield')!.status)}`}
              onClick={() => { cycleStatus('windshield'); setActiveZone('windshield'); }}
            />
            {/* Front Bumper */}
            <path 
              d="M 20 75 L 50 75 L 50 85 L 20 85 Z" 
              className={`cursor-pointer transition-colors duration-200 stroke-2 ${getStatusColor(zones.find(z => z.id === 'front_bumper')!.status)}`}
              onClick={() => { cycleStatus('front_bumper'); setActiveZone('front_bumper'); }}
            />
            {/* Left panels (top side of layout) */}
            <path 
              d="M 50 72 L 150 72 L 150 88 L 50 88 Z" 
              className={`cursor-pointer transition-colors duration-200 stroke-2 ${getStatusColor(zones.find(z => z.id === 'left_side')!.status)}`}
              onClick={() => { cycleStatus('left_side'); setActiveZone('left_side'); }}
            />
            {/* Tailgate / Bed */}
            <path 
              d="M 155 70 L 220 70 L 220 85 L 155 85 Z" 
              className={`cursor-pointer transition-colors duration-200 stroke-2 ${getStatusColor(zones.find(z => z.id === 'tailgate')!.status)}`}
              onClick={() => { cycleStatus('tailgate'); setActiveZone('tailgate'); }}
            />
          </svg>

          {/* Active indicator overlay */}
          {activeZone && (
            <div className="absolute -bottom-2 text-[9px] font-bold text-indigo-400">
              Active: {zones.find(z => z.id === activeZone)?.label}
            </div>
          )}
        </div>

        {/* Selected Zone Controls */}
        <div className="space-y-2.5">
          {activeZone ? (
            <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-850 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-zinc-455">{zones.find(z => z.id === activeZone)?.label}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getStatusBadge(zones.find(z => z.id === activeZone)!.status)}`}>
                  {zones.find(z => z.id === activeZone)?.status}
                </span>
              </div>
              <input 
                type="text"
                value={zones.find(z => z.id === activeZone)?.notes || ''}
                onChange={(e) => updateNotes(activeZone, e.target.value)}
                placeholder="Type pre-existing damage notes..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          ) : (
            <div className="text-center py-6 border border-dashed border-zinc-850 rounded-xl text-zinc-550 text-xs font-semibold">
              Click a part of the truck layout to log damage and add notes.
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-900 pt-2 text-[10px] space-y-1.5 max-h-[100px] overflow-y-auto no-scrollbar">
        <span className="font-extrabold text-zinc-450 uppercase block">Recorded Issues ({damageLogs.length})</span>
        {damageLogs.length === 0 ? (
          <p className="text-[9px] text-emerald-450 font-semibold">✓ No damage recorded. Vehicle marked clean.</p>
        ) : (
          <ul className="space-y-1">
            {damageLogs.map(log => (
              <li key={log.id} className="flex justify-between items-center bg-zinc-900/40 p-1 px-2 rounded border border-zinc-850">
                <span className="font-bold text-zinc-350">{log.label}</span>
                <span className="text-[9px] font-semibold text-rose-400">
                  {log.status} {log.notes && `("${log.notes}")`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 🔧 INTERACTIVE MOCKUP: QC TORQUE TESTING & SIGN-OFF
// =========================================================================

interface LugState {
  id: number;
  torque: number; // in ft-lbs
}

export function QualityControlMockup() {
  const [lugs, setLugs] = useState<LugState[]>([
    { id: 1, torque: 0 },
    { id: 2, torque: 0 },
    { id: 3, torque: 0 },
    { id: 4, torque: 0 },
    { id: 5, torque: 0 },
  ]);
  const [selectedLug, setSelectedLug] = useState<number | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signatureText, setSignatureText] = useState('');

  // Spec range is 80 - 95 ft-lbs
  const minSpec = 80;
  const maxSpec = 95;

  useEffect(() => {
    let interval: any;
    if (isPressing && selectedLug !== null) {
      interval = setInterval(() => {
        setLugs(prev => prev.map(lug => {
          if (lug.id !== selectedLug) return lug;
          const delta = Math.floor(Math.random() * 4) + 3; // increases by 3-6 ft-lbs per tick
          return { ...lug, torque: Math.min(lug.torque + delta, 130) }; // cap at 130
        }));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPressing, selectedLug]);

  const handleReset = () => {
    setLugs(lugs.map(l => ({ ...l, torque: 0 })));
    setSelectedLug(null);
    setSigned(false);
    setSignatureText('');
  };

  const getLugColor = (torque: number) => {
    if (torque === 0) return 'bg-zinc-800 border-zinc-700 text-zinc-400';
    if (torque < minSpec) return 'bg-amber-500/20 border-amber-500 text-amber-500';
    if (torque >= minSpec && torque <= maxSpec) return 'bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    return 'bg-rose-500/25 border-rose-500 text-rose-500 animate-pulse';
  };

  const allComplete = lugs.every(l => l.torque >= minSpec && l.torque <= maxSpec);

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none text-white max-h-[420px] overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold flex items-center gap-2">
          <Wrench className="w-4 h-4 text-indigo-400" />
          Lug Nut Torque Calibration
        </span>
        <button 
          onClick={handleReset}
          className="text-zinc-500 hover:text-zinc-350 cursor-pointer"
          title="Reset Test"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="my-4 grid grid-cols-12 gap-4 items-center">
        {/* Lug nuts layout wheel */}
        <div className="col-span-5 flex justify-center relative py-4">
          <div className="w-24 h-24 rounded-full border-4 border-zinc-850 bg-zinc-900 flex items-center justify-center relative">
            <div className="w-10 h-10 rounded-full bg-zinc-950 border-2 border-zinc-900" />
            
            {/* Lugs */}
            {lugs.map((lug, index) => {
              const angles = [0, 72, 144, 216, 288];
              const rad = (angles[index] * Math.PI) / 180;
              const x = Math.sin(rad) * 32;
              const y = -Math.cos(rad) * 32;

              return (
                <button
                  key={lug.id}
                  onClick={() => setSelectedLug(lug.id)}
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                  className={`absolute w-6 h-6 rounded-md border text-[9px] font-black flex items-center justify-center cursor-pointer transition-all active:scale-90 ${getLugColor(lug.torque)} ${
                    selectedLug === lug.id ? 'ring-2 ring-indigo-500 scale-110' : ''
                  }`}
                >
                  {lug.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="col-span-7 space-y-3">
          {selectedLug !== null ? (
            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-850 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-zinc-450">Lug Nut #{selectedLug}</span>
                <span className="font-mono text-sm font-black text-white">{lugs.find(l => l.id === selectedLug)?.torque} ft-lbs</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-900 relative">
                <div 
                  className={`h-full transition-all duration-100 ${
                    lugs.find(l => l.id === selectedLug)!.torque < minSpec 
                      ? 'bg-amber-500' 
                      : lugs.find(l => l.id === selectedLug)!.torque <= maxSpec 
                        ? 'bg-emerald-500' 
                        : 'bg-rose-500'
                  }`}
                  style={{ width: `${(lugs.find(l => l.id === selectedLug)!.torque / 120) * 100}%` }}
                />
                {/* Target bracket lines */}
                <div className="absolute left-[66%] top-0 bottom-0 w-[2px] bg-white/20" title="Spec Limit Low" />
                <div className="absolute left-[79%] top-0 bottom-0 w-[2px] bg-white/20" title="Spec Limit High" />
              </div>

              <div className="flex gap-2">
                <button
                  onMouseDown={() => setIsPressing(true)}
                  onMouseUp={() => setIsPressing(false)}
                  onMouseLeave={() => setIsPressing(false)}
                  onTouchStart={() => setIsPressing(true)}
                  onTouchEnd={() => setIsPressing(false)}
                  className="flex-1 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  Hold to Torque Wrench
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 border border-dashed border-zinc-850 rounded-xl text-zinc-550 text-[11px] font-semibold">
              Select lug nut 1 to 5 to calibrate torque.
            </div>
          )}
        </div>
      </div>

      {/* QC Sign-off Panel */}
      <div className="border-t border-zinc-900 pt-2.5 space-y-2">
        {allComplete ? (
          !signed ? (
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <input 
                type="text"
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
                placeholder="Type tech name to sign..."
                className="w-full sm:flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-2 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-indigo-500"
              />
              <button
                disabled={!signatureText.trim()}
                onClick={() => setSigned(true)}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shrink-0 justify-center"
              >
                <ShieldCheck className="w-4 h-4" /> Sign Inspection
              </button>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-[10px] font-black uppercase text-emerald-450 tracking-wider">QC Approved & Signed</p>
                  <p className="text-[9px] text-zinc-400 font-semibold font-mono">Tech Signature: {signatureText}</p>
                </div>
              </div>
              <span className="text-[9px] font-extrabold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase">Passed</span>
            </div>
          )
        ) : (
          <div className="text-center text-[10px] font-bold text-zinc-550 uppercase tracking-widest flex items-center justify-center gap-1">
            <Info className="w-3.5 h-3.5 text-zinc-500" />
            Torque target: {minSpec} - {maxSpec} ft-lbs
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 🎨 INTERACTIVE MOCKUP: VINYL BUBBLE HEAT GUN SIMULATOR
// =========================================================================

interface Bubble {
  id: number;
  x: number; // percent
  y: number; // percent
  size: number; // percent diameter (starts at 10-15)
  heat: number; // 0-100 (needs to be 60-80 to shrink)
}

export function GraphicsInstallMockup() {
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 1, x: 25, y: 30, size: 14, heat: 20 },
    { id: 2, x: 70, y: 45, size: 12, heat: 10 },
    { id: 3, x: 45, y: 70, size: 16, heat: 30 },
  ]);
  const [selectedTool, setSelectedTool] = useState<'heat_gun' | 'squeegee'>('heat_gun');
  const [feedback, setFeedback] = useState<string>('Select Heat Gun to warm up vinyl bubbles.');

  const handleBubbleClick = (id: number) => {
    setBubbles(prev => prev.map(b => {
      if (b.id !== id) return b;
      
      if (selectedTool === 'heat_gun') {
        const nextHeat = Math.min(b.heat + 25, 100);
        let msg = `Warming up bubble. Current heat: ${nextHeat}%.`;
        if (nextHeat >= 60 && nextHeat <= 85) {
          msg += ' Vinyl is soft! Switch to Squeegee to flatten it.';
        } else if (nextHeat > 85) {
          msg += ' WARNING: Vinyl is overheating! It may burn/melt.';
        }
        setFeedback(msg);
        return { ...b, heat: nextHeat };
      } else {
        // Squeegee tool
        if (b.heat < 55) {
          setFeedback('Warning: Vinyl is too cold! Squeegeeing cold vinyl causes tears or wrinkles.');
          return b;
        } else if (b.heat > 90) {
          setFeedback('Warning: Vinyl is scorched/too hot! Material is stretched out.');
          return b;
        } else {
          // perfect heat! Shrink size
          const nextSize = Math.max(b.size - 4, 0);
          setFeedback(nextSize === 0 ? 'Bubble completely flattened! Excellent job.' : 'Flattening bubble...');
          return { ...b, size: nextSize };
        }
      }
    }));
  };

  // Heat decays slowly
  useEffect(() => {
    const timer = setInterval(() => {
      setBubbles(prev => prev.map(b => {
        if (b.size === 0) return b;
        return { ...b, heat: Math.max(b.heat - 3, 0) };
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleReset = () => {
    setBubbles([
      { id: 1, x: 25, y: 30, size: 14, heat: 20 },
      { id: 2, x: 70, y: 45, size: 12, heat: 10 },
      { id: 3, x: 45, y: 70, size: 16, heat: 30 },
    ]);
    setFeedback('Select Heat Gun to warm up vinyl bubbles.');
  };

  const getBubbleColor = (b: Bubble) => {
    if (b.heat < 55) return 'bg-cyan-500/30 border-cyan-500/50 hover:bg-cyan-500/50';
    if (b.heat >= 55 && b.heat <= 90) return 'bg-orange-500/40 border-orange-500 hover:bg-orange-500/60 shadow-[0_0_10px_rgba(249,115,22,0.8)]';
    return 'bg-red-650/50 border-red-500 animate-ping';
  };

  const completed = bubbles.every(b => b.size === 0);

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none text-white max-h-[420px] overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold flex items-center gap-2">
          <PenTool className="w-4 h-4 text-indigo-400" />
          Vinyl Application Simulator
        </span>
        <button 
          onClick={handleReset}
          className="text-zinc-500 hover:text-zinc-350 cursor-pointer"
          title="Reset Surface"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Visual surface area */}
      <div className="my-3 aspect-[16/9] w-full rounded-2xl bg-zinc-900 border border-zinc-850 relative overflow-hidden flex items-center justify-center">
        {completed ? (
          <div className="text-center p-4 space-y-2 animate-in zoom-in-95 duration-500 z-10">
            <Sparkles className="w-10 h-10 text-emerald-450 mx-auto animate-bounce" />
            <p className="text-sm font-black text-emerald-400 uppercase tracking-widest">Finished Install!</p>
            <p className="text-[10px] text-zinc-400 font-semibold max-w-[200px] mx-auto">No bubbles remaining. Perfectly smooth surface tension achieved.</p>
          </div>
        ) : (
          /* Render bubbles */
          bubbles.map(b => {
            if (b.size === 0) return null;
            return (
              <button
                key={b.id}
                onClick={() => handleBubbleClick(b.id)}
                style={{
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  width: `${b.size * 2.8}px`,
                  height: `${b.size * 2.8}px`,
                }}
                className={`absolute rounded-full border transition-all cursor-pointer duration-100 flex items-center justify-center text-[7px] font-black -translate-x-1/2 -translate-y-1/2 ${getBubbleColor(b)}`}
              >
                {b.heat}%
              </button>
            );
          })
        )}
        
        {/* Subtle background grid representing car panel */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:24px_24px] opacity-15 pointer-events-none" />
      </div>

      {/* Tool Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedTool('heat_gun')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 ${
            selectedTool === 'heat_gun' 
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
              : 'bg-zinc-900 text-zinc-550 border-zinc-800'
          }`}
        >
          <Flame className="w-4 h-4" /> Heat Gun
        </button>
        <button
          onClick={() => setSelectedTool('squeegee')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 ${
            selectedTool === 'squeegee' 
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' 
              : 'bg-zinc-900 text-zinc-550 border-zinc-800'
          }`}
        >
          <Paintbrush className="w-4 h-4" /> Squeegee
        </button>
      </div>

      <div className={`mt-2.5 p-2 rounded-xl text-[10px] font-semibold border leading-relaxed text-center ${
        feedback.includes('Warning') 
          ? 'bg-rose-500/10 text-rose-455 border-rose-500/20' 
          : 'bg-zinc-900 border-zinc-850 text-zinc-400'
      }`}>
        {feedback}
      </div>
    </div>
  );
}

// =========================================================================
// 🔌 INTERACTIVE MOCKUP: HARNESS LOAD CALCULATOR
// =========================================================================

export function HarnessFabMockup() {
  const [current, setCurrent] = useState<number>(15); // Amps
  const [length, setLength] = useState<number>(15); // Feet
  const [gauge, setGauge] = useState<number>(14); // AWG (lower is thicker)
  const [fuse, setFuse] = useState<number>(20); // Amps

  // Maximum continuous ampacity for wire sizes at 105C in engine bay (standard upfitter spec)
  // 18 AWG: 10A continuous, 15A max
  // 16 AWG: 15A continuous, 20A max
  // 14 AWG: 20A continuous, 30A max
  // 12 AWG: 30A continuous, 45A max
  // 10 AWG: 40A continuous, 60A max
  // 8 AWG:  55A continuous, 80A max
  const getWireCapacity = (g: number) => {
    switch (g) {
      case 18: return 10;
      case 16: return 15;
      case 14: return 20;
      case 12: return 30;
      case 10: return 40;
      case 8: return 55;
      default: return 0;
    }
  };

  const capacity = getWireCapacity(gauge);

  // Status checks
  let status: 'safe' | 'warning' | 'danger' = 'safe';
  let message = 'Wiring configuration is safe and meets shop specifications.';

  if (current > capacity) {
    status = 'danger';
    message = `FIRE HAZARD: Current draw (${current}A) exceeds continuous wire limit (${capacity}A) for ${gauge} AWG. The wire will overheat and melt!`;
  } else if (fuse > capacity * 1.25) {
    status = 'warning';
    message = `SAFETY HAZARD: Fuse (${fuse}A) is rated too high for ${gauge} AWG wire capacity (${capacity}A). The wire could burn before the fuse blows.`;
  } else if (fuse < current) {
    status = 'warning';
    message = `NUISANCE BLOW: Fuse (${fuse}A) is smaller than current load (${current}A). The fuse will blow immediately.`;
  } else if (fuse > capacity) {
    status = 'warning';
    message = `Caution: Fuse (${fuse}A) is close to wire capacity. Keep wire run short to avoid heat fatigue.`;
  }

  return (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 p-5 flex flex-col justify-between shadow-2xl relative select-none text-white max-h-[420px] overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <span className="text-xs font-bold flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          Harness Load & Fuse Calculator
        </span>
        <span className="text-[9px] text-zinc-500 font-bold">Compliant to SAE J1128</span>
      </div>

      <div className="my-3 space-y-3">
        {/* Sliders */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-bold text-zinc-400">
            <span>Continuous Current Load</span>
            <span className="text-indigo-405 font-mono">{current} Amps</span>
          </div>
          <input 
            type="range"
            min="1"
            max="50"
            value={current}
            onChange={(e) => setCurrent(Number(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-bold text-zinc-400">
            <span>Wire Run Length</span>
            <span className="text-indigo-405 font-mono">{length} Feet</span>
          </div>
          <input 
            type="range"
            min="2"
            max="30"
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-505"
          />
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-wider">Wire Gauge</label>
            <select
              value={gauge}
              onChange={(e) => setGauge(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="18">18 AWG (Thinner)</option>
              <option value="16">16 AWG</option>
              <option value="14">14 AWG</option>
              <option value="12">12 AWG</option>
              <option value="10">10 AWG</option>
              <option value="8">8 AWG (Thicker)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-wider">Fuse Rating</label>
            <select
              value={fuse}
              onChange={(e) => setFuse(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="3">3 Amp Fuse</option>
              <option value="5">5 Amp Fuse</option>
              <option value="7.5">7.5 Amp Fuse</option>
              <option value="10">10 Amp Fuse</option>
              <option value="15">15 Amp Fuse</option>
              <option value="20">20 Amp Fuse</option>
              <option value="30">30 Amp Fuse</option>
              <option value="40">40 Amp Fuse</option>
              <option value="50">50 Amp Fuse</option>
            </select>
          </div>
        </div>
      </div>

      {/* Safety Alert Output */}
      <div className={`mt-2 p-3 rounded-xl border flex items-start gap-2.5 ${
        status === 'danger' 
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
          : status === 'warning' 
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-550' 
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
      }`}>
        {status === 'danger' && <Flame className="w-5 h-5 shrink-0 text-rose-500 animate-bounce" />}
        {status === 'warning' && <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />}
        {status === 'safe' && <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />}
        
        <div className="text-[10px] leading-relaxed">
          <p className="font-extrabold uppercase tracking-wide">
            {status === 'danger' ? 'Hazardous Configuration' : status === 'warning' ? 'Caution Recommended' : 'System Secure'}
          </p>
          <p className="font-semibold text-zinc-300 mt-0.5">{message}</p>
        </div>
      </div>
    </div>
  );
}

export interface SOP {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  estimatedTime: string;
  slides: SOPSlide[];
}

export const SOP_LIST: SOP[] = [
  {
    id: "vehicle_intake",
    title: "Vehicle Intake & Pre-Inspection",
    description: "Standard operating procedure for checking in new vehicles, mapping pre-existing damage, and securing customer keys.",
    icon: Car,
    estimatedTime: "4 mins",
    slides: [
      {
        title: "Initial Arrival & Placement",
        subtitle: "Step 1 of 4: Receiving the Vehicle",
        bulletPoints: [
          "Park the arriving vehicle in the designated staging bay or intake lane.",
          "Set the parking brake and turn off all electrical loads (radio, climate controls).",
          "Place the vehicle keys in a color-coded key bag labeled with the Job Number immediately."
        ],
        tips: [
          "Staging bay must stay clear of blocking pathways; check with the foreman if bays are full.",
          "Keep the window cracked open slightly to prevent lockout in case auto-lock triggers."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <Lock className="w-12 h-12 text-indigo-400" />
            <p className="text-xs font-bold uppercase tracking-wider">Secure The Keys</p>
            <p className="text-[10px] text-zinc-400 font-semibold max-w-[200px]">Keys must go to the key board immediately. Staging should never be left with keys inside the vehicle.</p>
          </div>
        )
      },
      {
        title: "Interactive Pre-Damage Mapping",
        subtitle: "Step 2 of 4: Documenting Imperfections",
        bulletPoints: [
          "Before any upfitting begins, perform a 360-degree walk-around inspection.",
          "Use the digital mapper tool on your tablet to record scratches, dents, or cracked panels.",
          "This protects the shop from liability for pre-existing customer vehicle damage."
        ],
        tips: [
          "Always take high-resolution photos of any major dent or windshield crack and attach them to the Job Card.",
          "Be thorough; check the cab interior for dashboard cracks or seat tears as well."
        ],
        visualElement: <VehicleIntakeMockup />
      },
      {
        title: "Cleanliness & Protection Prep",
        subtitle: "Step 3 of 4: Protecting Customer Assets",
        bulletPoints: [
          "Install protective covers: seat cover, floor mats, and steering wheel wrap.",
          "If performing exterior graphics or fabrication, apply fender guards/painter's tape to high-rub areas.",
          "Ensure boots are clean before stepping inside the vehicle cab."
        ],
        tips: [
          "Fender covers prevent metal buckles on your belt or pants from scratching the paint work.",
          "Discard disposable protection covers only when final delivery inspection is completed."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <Paintbrush className="w-12 h-12 text-indigo-400" />
            <p className="text-xs font-bold uppercase tracking-wider">Asset Protection Pack</p>
            <div className="text-[10px] text-zinc-400 font-mono space-y-1 bg-zinc-900 border border-zinc-850 p-2 rounded-lg">
              <div>[ ] Steering Wheel Wrap</div>
              <div>[ ] Disposable Seat Sleeve</div>
              <div>[ ] Paper Floor Mat</div>
            </div>
          </div>
        )
      },
      {
        title: "Status Update & System Intake",
        subtitle: "Step 4 of 4: Gating to Production",
        bulletPoints: [
          "Scan the job's intake QR code to update status to 'Intake Complete'.",
          "Ensure the status changes to 'Ready for Production' on the master Jobs Worksheet.",
          "Hang the key bag on the active production board slot corresponding to the assigned bay."
        ],
        tips: [
          "Double check that the primary technician assigned is correct on the Staff Worksheet.",
          "Write any critical customer notes (e.g. 'Customer requested old bumper returned') on the physical routing sheet."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-450">Intake Finalized</p>
            <p className="text-[10px] text-zinc-400 font-semibold max-w-[200px]">The vehicle is officially logged in. Job #1024 moved to 'Ready for Production'.</p>
          </div>
        )
      }
    ]
  },
  {
    id: "quality_control",
    title: "Quality Control & Sign-off Standards",
    description: "Procedure for torque testing critical suspension fasteners, checking electrical loads, and signing off completed builds.",
    icon: Wrench,
    estimatedTime: "5 mins",
    slides: [
      {
        title: "Critical Torque Calibration",
        subtitle: "Step 1 of 3: Fastener Verification",
        bulletPoints: [
          "Critical bolts (e.g., suspension U-bolts, track bars, lug nuts) must be torqued to specific factory settings.",
          "Use a calibrated digital torque wrench to tighten bolts until the indicator emits a solid green light or signal.",
          "Never guess or rely on impact guns for final torque verification."
        ],
        tips: [
          "Lug nuts for light trucks should typically be torqued between 85 - 100 ft-lbs.",
          "Always torque in a star pattern to ensure even distribution of clamping force."
        ],
        visualElement: <QualityControlMockup />
      },
      {
        title: "Electrical System Stress Test",
        subtitle: "Step 2 of 3: Amp Load Verification",
        bulletPoints: [
          "Turn on all added electrical accessories simultaneously (lightbars, winch, radio, warning flashes).",
          "Measure the battery voltage under full load. It must maintain a minimum of 12.8V with the engine running.",
          "Inspect all wire terminations to ensure they are cold to the touch after 5 minutes of continuous operation."
        ],
        tips: [
          "Any accessory wire that feels warm to the touch is undersized and must be re-engineered.",
          "Ensure ground points are scraped clean of paint and secured directly to bare metal chassis points."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-2.5">
            <AlertCircle className="w-10 h-10 text-amber-500" />
            <p className="text-xs font-bold uppercase tracking-wider text-amber-450">Stress Test Checklist</p>
            <div className="text-[10px] text-left text-zinc-400 space-y-1 bg-zinc-900 border border-zinc-850 p-2.5 rounded-lg w-full max-w-[220px]">
              <p>1. Start engine: check 14.2V alternator</p>
              <p>2. Toggle all aux lights on: wait 5m</p>
              <p>3. Thermal check: fuses & relays</p>
            </div>
          </div>
        )
      },
      {
        title: "QC Manager Digital Sign-off",
        subtitle: "Step 3 of 3: Closing the production ticket",
        bulletPoints: [
          "A foreman or secondary technician must inspect the vehicle and sign the digital QC card.",
          "The technician who performed the install cannot sign off on their own work.",
          "Once signed, the status updates to 'QC Passed' and automatically prompts the office to coordinate customer pickup."
        ],
        tips: [
          "Verify the physical QC sticker is placed inside the driver's door jamb.",
          "If any checklist items are rejected, the job returns to the original tech's workbench immediately."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <ShieldCheck className="w-12 h-12 text-indigo-400" />
            <p className="text-xs font-bold uppercase tracking-wider">Independent QC Audit</p>
            <p className="text-[10px] text-zinc-400 font-semibold max-w-[200px]">Strict four-eyes principle. Ensure another technician validates torque markings and clean cable runs.</p>
          </div>
        )
      }
    ]
  },
  {
    id: "graphics_install",
    title: "Vinyl Graphics & Wrap Adhesion",
    description: "Standard procedures for prepping vehicle body panels, managing application temperature, and eliminating air bubbles.",
    icon: PenTool,
    estimatedTime: "4 mins",
    slides: [
      {
        title: "Surface Decontamination Prep",
        subtitle: "Step 1 of 3: Chemical Cleaning",
        bulletPoints: [
          "Clean the application panel with soapy water to remove general dirt and grit.",
          "Decontaminate the surface using a clay bar if rough spots or overspray are detected.",
          "Perform a final wipe down using a 70% Isopropyl Alcohol (IPA) solution to remove grease and waxes."
        ],
        tips: [
          "Never skip the IPA step; wax or residue will prevent the vinyl adhesive from bonding securely.",
          "Let the IPA flash off completely before positioning the vinyl graphic."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-2.5">
            <Paintbrush className="w-10 h-10 text-indigo-400" />
            <p className="text-xs font-bold uppercase tracking-wider">IPA Flash Off</p>
            <div className="w-full bg-zinc-900 border border-zinc-850 p-2.5 rounded-lg text-left text-[10px] text-zinc-400 space-y-1">
              <p className="text-emerald-400">✓ 1st: Soap wash & rinse</p>
              <p className="text-emerald-400">✓ 2nd: Clay bar treatment</p>
              <p className="text-emerald-400">✓ 3rd: 70% IPA wipe</p>
            </div>
          </div>
        )
      },
      {
        title: "Adhesion & Bubble Elimination",
        subtitle: "Step 2 of 3: Applying Heat & Pressure",
        bulletPoints: [
          "Position the graphic using hinge tape and squeegee from the center outwards.",
          "Use a heat gun to warm the vinyl to between 60°C - 80°C. This makes the cast vinyl pliable.",
          "Squeegee out trapped air bubbles immediately while the vinyl is warm and soft."
        ],
        tips: [
          "If you squeegee cold vinyl, you risk tearing or creating hard creases that cannot be repaired.",
          "Overheating past 95°C will scorch the graphic and stretch the material out of shape."
        ],
        visualElement: <GraphicsInstallMockup />
      },
      {
        title: "Post-Heating Post-Cure Standard",
        subtitle: "Step 3 of 3: Locking the Memory State",
        bulletPoints: [
          "Once the graphic is applied, perform a final 'post-heating' pass over all edges and deep recesses.",
          "Heat the vinyl edges to exactly 90°C. This overrides the vinyl's physical 'shape memory' and locks it.",
          "If post-heating is skipped, the vinyl will lift or shrink back over time, especially in hot weather."
        ],
        tips: [
          "Use an infrared thermometer to verify edge temperatures reach the required 90°C post-cure limit.",
          "Apply edge sealer pen along exposed bottom panels subject to high road grit."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <Flame className="w-12 h-12 text-rose-500 animate-pulse" />
            <p className="text-xs font-bold uppercase tracking-wider">Post-Heating Edge Lock</p>
            <p className="text-[10px] text-zinc-400 font-semibold max-w-[200px]">Post-heating breaks the original chemical molecular memory. Crucial for deep recesses and channels.</p>
          </div>
        )
      }
    ]
  },
  {
    id: "harness_fab",
    title: "Wiring Harness Fabrication Safety",
    description: "Guidelines on sizing cables, picking correct fuses, routing wire runs safely, and sealing weather connections.",
    icon: Layers,
    estimatedTime: "5 mins",
    slides: [
      {
        title: "Calculations: Amps, Gauges & Fuses",
        subtitle: "Step 1 of 3: Electrical Sizing",
        bulletPoints: [
          "Sizing your conductor correctly is critical to prevent electrical fires and voltage drop.",
          "Select the wire gauge (AWG) based on the total continuous current draw and length of the run.",
          "Choose a fuse rated to protect the wire itself, not the device. The fuse must be rated below the wire's limit."
        ],
        tips: [
          "Never place a large fuse (e.g. 30A) on thin wire (e.g. 18 AWG) even if the lightbar requires 15A.",
          "For runs over 15 feet, always size up one wire gauge to account for resistance voltage drop."
        ],
        visualElement: <HarnessFabMockup />
      },
      {
        title: "Routing & Abrasion Protection",
        subtitle: "Step 2 of 3: Physical Protection",
        bulletPoints: [
          "All wiring must be covered in split loom or braided sleeving (snakeskin) for abrasion protection.",
          "Anchor wire looms every 12 - 18 inches using rubber-insulated P-clamps or heavy-duty zip ties.",
          "Route cabling away from heat sources (exhaust manifolds) and moving parts (steering columns, suspension)."
        ],
        tips: [
          "When passing through metal bulkheads, always use a rubber firewall grommet. Metal edges will cut wires.",
          "Leave a 2-inch drip loop before wires enter weather-proof connector boxes."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <AlertTriangle className="w-12 h-12 text-amber-500" />
            <p className="text-xs font-bold uppercase tracking-wider">Bulkhead Grommets Required</p>
            <p className="text-[10px] text-zinc-400 font-semibold max-w-[200px]">Never route bare wire through drilled metal. Vibration will rub the insulation off, causing dead shorts.</p>
          </div>
        )
      },
      {
        title: "Crimping & Weatherproofing Seals",
        subtitle: "Step 3 of 3: Moisture Protection",
        bulletPoints: [
          "Use ratcheting crimp tools to secure terminal lugs; non-ratcheting pliers result in weak joints.",
          "Apply dual-wall heat shrink tubing containing heat-activated adhesive sealant over all splices.",
          "Fill weather-pack connectors with dielectric grease to block moisture ingress on exterior plugs."
        ],
        tips: [
          "Pull-test crimped lugs with 10 lbs of force to confirm mechanical integrity.",
          "Solder splices are forbidden on vehicle harnesses because solder joint transitions fail under vibration."
        ],
        visualElement: (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <p className="text-xs font-bold uppercase tracking-wider">Adhesive Heat Shrink</p>
            <p className="text-[10px] text-zinc-400 font-semibold max-w-[200px]">Adhesive melts and forms a watertight barrier. Normal heat shrink will let water wick inside and corrode copper wires.</p>
          </div>
        )
      }
    ]
  }
];
