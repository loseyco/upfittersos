const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/business/estimates/EstimateBuilderV2.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const lines = content.split(/\r?\n/);

let quoteStart = -1, quoteEnd = -1;
let logStart = -1, logEnd = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Project Financials\'}</h3>') || lines[i].includes('Quote Totals\'}</h3>')) {
        for (let j = i; j >= i - 10; j--) {
            if (lines[j].includes('<div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl')) {
                quoteStart = j;
                break;
            }
        }
    }
    if (quoteStart !== -1 && lines[i].includes('Send for Approval (Lock Quoted Value)')) {
        // find outer div end string
        for(let j=i+1; j < Math.min(i+35, lines.length); j++) {
            if(lines[j].includes('Dispatch Job (Mark In Progress)')) {
                // The outer div ends exactly 8 lines after this
                quoteEnd = j + 9;
                break;
            }
        }
    }
    
    if (lines[i].includes('Project Logistics & Targets')) {
        for (let j = i; j >= i - 5; j--) {
            if (lines[j].includes('<div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden shrink-0">')) {
                logStart = j - 1; // start before the comment
                break;
            }
        }
    }
    
    if (logStart !== -1 && lines[i].includes('Internal Completion ETA')) {
        // find end of logistics
        for(let j=i; j < Math.min(i+40, lines.length); j++) {
            if(lines[j].includes('</select>') || lines[j].includes('<div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 pb-8 shadow-xl flex flex-col max-h-[800px] shrink-0">')) {
                 if (lines[j-2].includes('</div>')) {
                      logEnd = j - 1; // end right before the next card or select
                      break;
                 }
            }
        }
    }
}

if(quoteStart === -1 || quoteEnd === -1 || logStart === -1 || logEnd === -1) {
    console.log("Could not find blocks precisely:", {quoteStart, quoteEnd, logStart, logEnd});
    process.exit(1);
}

const quoteBlock = lines.slice(quoteStart, quoteEnd);
let logBlock = lines.slice(logStart, logEnd);

// Before we inject them, let's restore the original styling to Quote Block
for(let i=0; i<quoteBlock.length; i++) {
    if(quoteBlock[i].includes('rounded-2xl p-4 shadow-xl border border-indigo-500 text-white relative overflow-hidden xl:sticky xl:top-24 z-40')) {
        quoteBlock[i] = quoteBlock[i].replace('rounded-2xl p-4 shadow-xl border border-indigo-500 text-white relative overflow-hidden xl:sticky xl:top-24 z-40', 'rounded-3xl p-6 shadow-xl border border-indigo-500 text-white relative overflow-hidden');
    }
    if(quoteBlock[i].includes('text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-3')) {
        quoteBlock[i] = quoteBlock[i].replace('text-[10px]', 'text-xs').replace('mb-3', 'mb-6');
    }
    if(quoteBlock[i].includes('space-y-1.5')) {
        quoteBlock[i] = quoteBlock[i].replace('space-y-1.5', 'space-y-3').replace('mb-4', 'mb-8');
    }
    if(quoteBlock[i].includes('rounded px-2 pl-4 py-0 w-20 text-right')) {
        quoteBlock[i] = quoteBlock[i].replace('pl-4 py-0 w-20', 'pl-5 py-0.5 w-24');
    }
    if(quoteBlock[i].includes('rounded px-2 text-green-400 py-0 w-20 text-right')) {
         quoteBlock[i] = quoteBlock[i].replace('text-green-400 py-0 w-20 text-right focus:outline-none focus:bg-indigo-900/50 transition-all font-mono shadow-inner pr-5', 'text-green-400 py-0.5 w-24 text-right focus:outline-none focus:bg-indigo-900/50 transition-all font-mono shadow-inner pr-6');
    }
    if(quoteBlock[i].includes('text-[9px] text-green-400/80 font-mono italic -mt-1')) {
        quoteBlock[i] = quoteBlock[i].replace('text-[9px]', 'text-[10px]').replace('-mt-1', '-mt-1 pb-1');
    }
    if(quoteBlock[i].includes('pb-2 border-b border-indigo-400/30')) {
        quoteBlock[i] = quoteBlock[i].replace('pb-2', 'pb-3');
    }
    if(quoteBlock[i].includes('text-sm font-black tracking-wide')) {
        quoteBlock[i] = quoteBlock[i].replace('text-sm', 'text-base');
    }
    if(quoteBlock[i].includes('text-2xl')) {
        quoteBlock[i] = quoteBlock[i].replace('text-2xl', 'text-4xl').replace('text-xl', 'text-2xl');
    }
    if(quoteBlock[i].includes('mt-2 pt-2 border-t-2')) {
        quoteBlock[i] = quoteBlock[i].replace('mt-2 pt-2', 'mt-4 pt-4');
    }
    if(quoteBlock[i].includes('text-[8px]')) {
        quoteBlock[i] = quoteBlock[i].replace('text-[8px]', 'text-[9px]');
    }
    if(quoteBlock[i].includes('<span className="text-[9px] text-indigo-200/80 text-right mt-0.5 pt-0.5">')) {
         quoteBlock[i] = quoteBlock[i].replace('text-[9px]', 'text-[10px]').replace('mt-0.5 pt-0.5', 'mt-1 pt-1');
    }
}

// Ensure logistics block contains dropoff/pickup
logBlock = `                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden shrink-0">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-400"></div> Project Logistics & Targets
                            </h2>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div>
                                <div className="flex flex-row items-center justify-between mb-1 shadow-sm">
                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest">Facility Location (Bay / Room)</label>
                                    {job.currentLocationId && (
                                        <button onClick={() => window.open(\`/business/areas/\${job.currentLocationId}\`, '_blank')} className="text-[9px] text-indigo-400 font-bold hover:text-indigo-300 flex items-center gap-1 uppercase tracking-widest transition-colors mb-0.5" title="Open Live Dashboard">
                                            Area Profile <ExternalLink className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                                <select
                                    value={job.currentLocationId || ''}
                                    onChange={e => setJob({ ...job, currentLocationId: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white cursor-pointer focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                >
                                    <option value="">-- Unassigned --</option>
                                    {allAreas.map(area => (
                                        <option key={area.id} value={area.id}>{area.label || area.id}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Customer Drop-off</label>
                                    <input
                                        type="datetime-local"
                                        disabled={isLocked}
                                        value={job.desiredDropoffDate || ''}
                                        onClick={(e) => { try { (e.target as any).showPicker(); } catch (e) { } }}
                                        onChange={e => setJob({ ...job, desiredDropoffDate: e.target.value })}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white cursor-pointer focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 shadow-sm">Customer Pick-up (Target)</label>
                                    <input
                                        type="datetime-local"
                                        disabled={isLocked}
                                        value={job.desiredPickupDate || ''}
                                        onClick={(e) => { try { (e.target as any).showPicker(); } catch (e) { } }}
                                        onChange={e => setJob({ ...job, desiredPickupDate: e.target.value })}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white cursor-pointer focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono disabled:opacity-50"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1 shadow-sm flex items-center justify-between">
                                        <span>Internal Completion ETA</span>
                                        {!isLocked && job?.desiredDropoffDate && (
                                            <button 
                                                onClick={calculateAutoETA} 
                                                type="button" 
                                                className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded shadow shadow-indigo-900/50 transition-all font-mono"
                                            >
                                                Auto-Calc
                                            </button>
                                        )}
                                    </label>
                                    {!job?.desiredDropoffDate ? (
                                        <div className="w-full bg-zinc-950/50 border border-indigo-500/20 border-dashed rounded-lg px-4 py-2.5 text-sm text-indigo-400/60 font-mono flex items-center justify-between">
                                            <span>Waiting on Drop-off Date</span>
                                            {(job?.tasks?.reduce((acc: number, t: any) => acc + (Number(t.bookTime) || 0), 0) || 0) > 0 ? (
                                                <span className="font-bold text-indigo-400 tracking-wider">
                                                    ~\`\${((job?.tasks?.reduce((acc: number, t: any) => acc + (Number(t.bookTime) || 0), 0) || 0) / 8).toFixed(1)}\` DAYS
                                                </span>
                                            ) : (
                                                <span className="opacity-50">--</span>
                                            )}
                                        </div>
                                    ) : (
                                        <input
                                            type="datetime-local"
                                            disabled={isLocked}
                                            value={job.completionEta || ''}
                                            onClick={(e) => { try { (e.target as any).showPicker(); } catch (e) { } }}
                                            onChange={e => setJob({ ...job, completionEta: e.target.value })}
                                            className="w-full bg-zinc-950 border border-indigo-500/30 rounded-lg px-4 py-2.5 text-sm text-indigo-200 cursor-pointer focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono disabled:opacity-50"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>`.split('\n');

const newLines = [];
for (let i = 0; i < lines.length; i++) {
    if (i >= quoteStart && i < quoteEnd) {
        continue;
    }
    if (i >= logStart && i < logEnd) {
        continue;
    }
    
    newLines.push(lines[i]);
    
    if (lines[i].includes(' {/* END MAIN WORK COLUMN (Wait, Customer + Vehicle were here. Moved to right column.) */}')) {
         newLines.push(...quoteBlock);
    }

    if (lines[i].includes('{/* INTERNAL SCOPE NOTE */}')) {
        // Drop Logistics right before Internal Scope note
        newLines.pop();
        newLines.push(...logBlock);
         newLines.push('');
        newLines.push(lines[i]);
    }
}

fs.writeFileSync(filePath, newLines.join('\\n'));
console.log('Successfully reverted layout and styling.');
