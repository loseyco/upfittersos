import { useState, useEffect } from 'react';
import { X, Calendar, Wrench, ArrowRight, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';
import { StaffSelector } from '../EntitySelectors';

export function IntakeSchedulingModal({ 
//...
    job, 
    onClose, 
    allStaff, 
    tenantId, 
    customer, 
    vehicle 
}: { 
    job: any, 
    onClose: () => void, 
    allStaff: any[], 
    tenantId: string, 
    customer?: any, 
    vehicle?: any 
}) {
    const [loading, setLoading] = useState(false);
    
    // Dates
    const [scheduledStart, setScheduledStart] = useState<string>(job.scheduledStart || '');
    const [scheduledEnd, setScheduledEnd] = useState<string>(job.scheduledEnd || '');
    const [businessSettings, setBusinessSettings] = useState<any>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        import('firebase/firestore').then(({ doc, getDoc }) => {
            import('../../lib/firebase').then(({ db }) => {
                getDoc(doc(db, 'businesses', tenantId)).then(snapshot => {
                    if (snapshot.exists()) {
                        setBusinessSettings(snapshot.data());
                    }
                }).catch(err => console.error(err));
            });
        });
    }, [tenantId]);

    // Clone tasks so we can modify assignments safely
    const [tasks, setTasks] = useState<any[]>(job?.tasks ? JSON.parse(JSON.stringify(job.tasks)) : []);

    const toggleAssignment = async (taskIndex: number, uid: string) => {
        const newTasks = [...tasks];
        const task = newTasks[taskIndex];
        if (!task.assignedUids) task.assignedUids = [];
        
        if (task.assignedUids.includes(uid)) {
            task.assignedUids = task.assignedUids.filter((u: string) => u !== uid);
        } else {
            task.assignedUids.push(uid);
        }
        setTasks(newTasks);

        // Auto-save assignment to cloud so it is not lost if modal closes
        try {
            await api.put(`/jobs/${job.id}`, { 
                tasks: newTasks,
                tenantId 
            });
        } catch (e) {
            console.error("Failed to auto-save assignment", e);
        }
    };

    const handleStartWork = async () => {
        setLoading(true);
        try {
            await api.put(`/jobs/${job.id}`, { 
                status: 'Scheduled', 
                tasks,
                scheduledStart: scheduledStart || null,
                scheduledEnd: scheduledEnd || null,
                tenantId 
            });
            toast.success("Job Finalized! Moved to Scheduled workflow.");
            onClose();
        } catch (e) {
            console.error(e);
            toast.error("Failed to schedule job.");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4 sm:p-6 overflow-y-auto">
            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in relative flex flex-col max-h-full">
                
                <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-500/20 text-teal-500 text-[10px] font-black uppercase tracking-widest rounded-full mb-3 border border-teal-500/50">
                            <Calendar className="w-3 h-3" /> Scheduling & Intake Next
                        </div>
                        <h2 className="text-3xl font-black text-white tracking-tight leading-none">{job.title || 'Untitled Job'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 bg-zinc-800 hover:bg-zinc-700/80 rounded-full text-zinc-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                    {/* Customer & Vehicle info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest font-black mb-1">Customer</div>
                            <div className="text-white font-bold">{customer ? `${customer.firstName} ${customer.lastName}` : 'Walk-in Customer'}</div>
                        </div>
                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest font-black mb-1">Vehicle</div>
                            <div className="text-white font-bold">{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle'}</div>
                        </div>
                    </div>

                    {/* Scheduling Dates */}
                    <section>
                         <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-2">
                             <Calendar className="w-4 h-4 text-accent"/> Appointment Times
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                 <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Scheduled Drop-off</label>
                                 <input 
                                     type="datetime-local" 
                                     value={scheduledStart}
                                     onChange={e => setScheduledStart(e.target.value)}
                                     className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" 
                                 />
                             </div>
                             <div>
                                 <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Estimated Completion</label>
                                 <input 
                                     type="datetime-local" 
                                     value={scheduledEnd}
                                     onChange={e => setScheduledEnd(e.target.value)}
                                     className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" 
                                 />
                             </div>
                         </div>
                    </section>

                    {/* Work Order Line Items */}
                    <section>
                         <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-2">
                             <Wrench className="w-4 h-4 text-indigo-400"/> Work Order Line Items
                         </h3>
                         <div className="space-y-4">
                             {tasks.length === 0 && (
                                 <p className="text-sm text-zinc-500 italic">No tasks on this job scope.</p>
                             )}
                             {tasks.map((task: any, idx: number) => {
                                 const assignedUids = task.assignedUids || [];
                                 
                                 // Financial Calculations
                                 const taskQuotedValue = (Number(task.bookTime || 0) * Number(task.laborRate || 0)) + 
                                     (task.parts || []).reduce((acc: number, p: any) => acc + (Number(p.price || 0) * Number(p.quantity || 1) * (1 - (Number(p.discount || 0)/100))), 0);

                                 return (
                                     <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg group">
                                         
                                         {/* TASK HEADER */}
                                         <div className="bg-zinc-900/50 p-3 border-b border-zinc-800/60 flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[9px] text-zinc-500 font-black uppercase tracking-widest shadow-sm">Task Name / Procedure</label>
                                                <div className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-[8px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                                                    ✓ Approved
                                                </div>
                                            </div>
                                            <div className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-3 py-2 text-base text-white font-black shadow-inner">
                                                {task.title}
                                            </div>
                                            
                                            <div className="flex flex-col md:flex-row justify-between gap-4 pt-1">
                                                <div className="flex items-start gap-6">
                                                     <div className="w-32 md:w-48">
                                                         <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2 flex items-center gap-1">Department</label>
                                                         <div className="text-sm text-white font-bold max-w-full truncate" title={task.departmentId || 'Global / None'}>
                                                            {task.departmentId 
                                                                ? (typeof task.departmentId === 'object' ? (task.departmentId.name || 'Unknown') : (businessSettings?.departments?.find((d: any) => d.id === task.departmentId)?.name || String(task.departmentId).replace(/_/g, ' ').toUpperCase()))
                                                                : 'Global / None'
                                                            }
                                                         </div>
                                                     </div>
                                                    <div className="w-24 pl-6 border-l border-zinc-800/60">
                                                        <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2 flex items-center gap-1">Hrs</label>
                                                        <div className="text-sm text-white font-mono font-bold">{task.bookTime || 0}</div>
                                                    </div>
                                                    <div className="w-28 pl-6 border-l border-zinc-800/60">
                                                        <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2 flex items-center gap-1">Rate ($)</label>
                                                        <div className="text-sm text-white font-mono font-bold">${task.laborRate || 0}</div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col justify-center items-end md:pl-4 md:border-l border-zinc-800/60 mt-1 md:mt-0">
                                                    <label className="block text-[9px] text-zinc-500 font-black uppercase tracking-widest mb-0.5">Approved Est</label>
                                                    <span className="font-mono text-zinc-300 font-black text-lg tracking-tight">${taskQuotedValue.toFixed(2)}</span>
                                                </div>
                                            </div>
                                         </div>

                                         {/* ASSOCIATED PARTS */}
                                         <div className="p-3 bg-zinc-950 border-b border-zinc-800/50">
                                             <div className="flex items-center justify-between mb-2">
                                                 <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-1.5">
                                                     <Wrench className="w-3 h-3" /> Associated Parts
                                                 </span>
                                             </div>
                                             {(!task.parts || task.parts.length === 0) ? (
                                                 <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg p-2 flex justify-between items-center text-xs font-mono text-zinc-500">
                                                     No parts added.
                                                 </div>
                                             ) : (
                                                 <div className="space-y-2">
                                                     {task.parts.map((part: any, pIdx: number) => (
                                                         <div key={pIdx} className={`flex gap-2 items-center bg-zinc-900 border ${part.providedBy === 'Customer' ? 'border-amber-500/30 bg-amber-500/5' : 'border-zinc-800'} rounded-xl p-2`}>
                                                             <div className="flex-1 min-w-0 pr-2 border-r border-zinc-800/60 flex flex-col items-start gap-1 pl-2">
                                                                 <span className="text-sm text-white font-bold">{part.name}</span>
                                                                 {part.providedBy === 'Customer' ? (
                                                                     <span className="text-[8px] font-black tracking-widest uppercase text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Customer Provided</span>
                                                                 ) : part.availability === 'In Stock' ? (
                                                                     <span className="text-[8px] font-black tracking-widest uppercase text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/20">✓ In Stock</span>
                                                                 ) : part.estimatedDeliveryDate ? (
                                                                     <span className="text-[8px] font-black tracking-widest uppercase text-sky-400 bg-sky-400/10 px-1.5 py-0.5 rounded border border-sky-400/20">ETA: {part.estimatedDeliveryDate}</span>
                                                                 ) : (
                                                                     <span className="text-[8px] font-black tracking-widest uppercase text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">Pending Inventory Check</span>
                                                                 )}
                                                             </div>
                                                             <div className="w-16 border-l border-zinc-800 pl-2">
                                                                 <div className="flex flex-col">
                                                                     <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Qty</span>
                                                                     <span className="text-sm text-white font-mono px-1">{part.quantity}</span>
                                                                 </div>
                                                             </div>
                                                             <div className="w-24 border-l border-zinc-800 pl-2">
                                                                 <div className="flex flex-col">
                                                                     <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Price($)</span>
                                                                     <span className="text-sm text-white font-mono px-1">{part.price}</span>
                                                                 </div>
                                                             </div>
                                                             <div className="font-mono text-zinc-300 font-black text-sm w-24 text-right pr-2">
                                                                     ${((Number(part.price) * (1 - (Number(part.discount || 0) / 100))) * Number(part.quantity)).toFixed(2)}
                                                             </div>
                                                         </div>
                                                     ))}
                                                 </div>
                                             )}
                                         </div>

                                         {/* ASSIGNED TECHS */}
                                         <div className="p-3 bg-zinc-950 border-b border-zinc-800/50">
                                             <div className="flex items-center justify-between mb-2">
                                                 <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-1.5">
                                                     <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> 
                                                     Assigned Techs
                                                 </span>
                                                 <div className="ml-auto">
                                                     <StaffSelector
                                                         trigger={
                                                             <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-[10px] font-black tracking-widest uppercase text-white transition-colors">
                                                                 <Plus className="w-3 h-3" /> Assign Tech
                                                             </button>
                                                         }
                                                         onOpen={async () => {
                                                             // We already have allStaff via props
                                                         }}
                                                         data={allStaff}
                                                         emptyMessage="No staff loaded."
                                                         value={assignedUids}
                                                         onChange={(uid: string) => toggleAssignment(idx, uid)}
                                                     />
                                                 </div>
                                             </div>
                                             {(!assignedUids || assignedUids.length === 0) ? (
                                                 <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg p-2 flex justify-between items-center text-xs font-mono text-zinc-500">
                                                     No staff assigned.
                                                 </div>
                                             ) : (
                                                 <div className="flex flex-wrap gap-2">
                                                     {assignedUids.map((uid: string) => {
                                                         const member = allStaff.find((s: any) => s.id === uid || s.uid === uid);
                                                         return (
                                                             <div key={uid} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800/50 rounded-lg p-2 pl-3">
                                                                 <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                                                                     {member?.photoUrl ? (
                                                                         <img src={member.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                                                                     ) : (
                                                                         <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                                                                             {member?.email?.[0]?.toUpperCase() || '?'}
                                                                         </div>
                                                                     )}
                                                                 </div>
                                                                 <div className="flex flex-col pr-4 border-r border-zinc-800/50">
                                                                     <span className="text-xs font-bold text-white whitespace-nowrap">{member?.displayName || member?.firstName || 'Unknown Staff'}</span>
                                                                     <span className="text-[9px] font-black tracking-widest uppercase text-emerald-400">Assigned</span>
                                                                 </div>
                                                                 <button 
                                                                     onClick={() => toggleAssignment(idx, uid)}
                                                                     className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                                                                 >
                                                                     <X className="w-3.5 h-3.5" />
                                                                 </button>
                                                             </div>
                                                         );
                                                     })}
                                                 </div>
                                             )}
                                         </div>

                                         {/* SCOPE NOTES - Expandable or compact */}
                                         <div className="p-3 bg-zinc-950">
                                             <div className="flex items-center justify-between mb-2">
                                                 <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-1.5">
                                                     Scope Notes (Internal)
                                                 </span>
                                             </div>
                                             {task.notes ? (
                                                <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-3 text-xs text-zinc-300">
                                                    {task.notes}
                                                </div>
                                             ) : (
                                                <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-3 text-center text-[10px] text-zinc-600 font-mono italic">
                                                    No internal notes for this task.
                                                </div>
                                             )}
                                         </div>

                                     </div>
                                 );
                             })}
                         </div>
                    </section>

                </div>

                <div className="p-6 border-t border-zinc-800 bg-zinc-900/80">
                    <button 
                        disabled={loading}
                        onClick={handleStartWork} 
                        className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black tracking-widest uppercase text-sm shadow-[0_0_20px_rgba(79,70,229,0.3)] flex justify-center items-center gap-2 transition-all disabled:opacity-50"
                    >
                        Finalize Schedule & Book <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
