import { Calculator, X, Copy, Terminal, Info, Clock, Layers } from 'lucide-react';
import { toast } from 'sonner';

export interface CalculationVariable {
  name: string;
  value: string | number;
  description: string;
  sourceDoc?: string;
}

export interface CalculationBreakdownRow {
  label: string;
  value: string | number;
  subText?: string;
  badge?: string;
}

export interface CalculationDerivationModalProps {
  title: string;
  metricValue: string | number;
  formula: string;
  mathEquation?: string;
  variables: CalculationVariable[];
  breakdownTable?: CalculationBreakdownRow[];
  auditNotes?: string[];
  rawObject?: any;
  onClose: () => void;
}

export function CalculationDerivationModal({
  title,
  metricValue,
  formula,
  mathEquation,
  variables,
  breakdownTable,
  auditNotes,
  rawObject,
  onClose
}: CalculationDerivationModalProps) {
  const copyDebugPayload = () => {
    const payload = {
      title,
      metricValue,
      formula,
      mathEquation,
      variables,
      breakdownTable,
      auditNotes,
      rawObject,
      timestamp: new Date().toISOString()
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("Calculation audit payload copied to clipboard!");
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl max-w-3xl w-full p-6 text-white shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                  CALCULATION DERIVATION AUDIT
                </span>
                <span className="text-[10px] font-bold text-zinc-400">Super Admin Inspector</span>
              </div>
              <h3 className="text-lg font-black text-white mt-0.5">{title}</h3>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Metric Result Banner */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-indigo-950/40 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Calculated Result</span>
            <span className="text-2xl font-mono font-black text-emerald-400 block mt-0.5">{metricValue}</span>
          </div>
          {mathEquation && (
            <div className="text-right">
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">Math Derivation</span>
              <span className="text-xs font-mono font-bold text-zinc-300 block mt-0.5 bg-zinc-955 px-3 py-1.5 rounded-xl border border-zinc-800">
                {mathEquation}
              </span>
            </div>
          )}
        </div>

        {/* Math Formula Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
          <span className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-4 h-4 text-amber-400" /> Standard Formula Applied
          </span>
          <code className="text-xs font-mono font-bold text-indigo-300 bg-zinc-955 p-3 rounded-xl border border-zinc-800/80 block leading-relaxed">
            {formula}
          </code>
        </div>

        {/* Input Variables List */}
        {variables && variables.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-black text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" /> Input Variables & Values
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {variables.map((v, i) => (
                <div key={i} className="bg-zinc-900 p-3.5 rounded-2xl border border-zinc-800 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">{v.name}</span>
                    <span className="text-xs font-mono font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {v.value}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300 font-medium leading-snug mt-0.5">{v.description}</p>
                  {v.sourceDoc && (
                    <span className="text-[9px] font-mono text-zinc-500 truncate mt-1">
                      Source: {v.sourceDoc}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Calculation Rows Table */}
        {breakdownTable && breakdownTable.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-black text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" /> Calculation Step Breakdown
            </span>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800">
              {breakdownTable.map((row, i) => (
                <div key={i} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-zinc-850/40 transition-colors">
                  <div className="flex flex-col">
                    <span className="font-bold text-zinc-200">{row.label}</span>
                    {row.subText && <span className="text-[10px] font-medium text-zinc-400">{row.subText}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {row.badge && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {row.badge}
                      </span>
                    )}
                    <span className="font-mono font-black text-emerald-400 text-xs">{row.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Trail Notes */}
        {auditNotes && auditNotes.length > 0 && (
          <div className="bg-amber-500/[0.05] border border-amber-500/20 rounded-2xl p-4 flex flex-col gap-2">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400" /> Calculation Rules & Audit Verdict
            </span>
            <ul className="list-disc list-inside text-xs text-zinc-300 space-y-1 font-medium">
              {auditNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Raw Object Inspector & Copy Button */}
        <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Raw Inspection Tree (JSON)</span>
            <button
              onClick={copyDebugPayload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-indigo-400" /> Copy Debug JSON
            </button>
          </div>
          {rawObject && (
            <pre className="bg-zinc-955 text-emerald-400 p-4 rounded-2xl border border-zinc-800 text-[11px] font-mono overflow-x-auto max-h-52 shadow-inner">
              {JSON.stringify(rawObject, null, 2)}
            </pre>
          )}
        </div>

      </div>
    </div>
  );
}
