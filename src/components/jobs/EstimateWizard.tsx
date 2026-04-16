import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, ShieldCheck, Calculator, Box, PlusCircle, UserPlus, Info, User, Truck, Briefcase } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { InventorySelector } from '../EntitySelectors';

interface EstimateWizardProps {
    jobId: string;
    onClose: () => void;
    onComplete: () => void;
    isEmbedded?: boolean;
    initialContext?: {
        customerName?: string;
        vehicleDetails?: any;
    };
}

export function EstimateWizard({ jobId, onClose, onComplete, isEmbedded, initialContext }: EstimateWizardProps) {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [job, setJob] = useState<any>(null);
    const [tasks, setTasks] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    
    const [allInventory, setAllInventory] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [highlightedRates, setHighlightedRates] = useState<Record<number, boolean>>({});

    // Config values
    const [taxRate, setTaxRate] = useState<number>(8.25);
    const [discount, setDiscount] = useState<number>(0);
    const [shopSuppliesRate] = useState<number>(5.0); // 5% shop supplies
    const [laborRate] = useState<number>(150); // Default hourly rate

    useEffect(() => {
        const fetchJob = async () => {
            if (!jobId) return;
            try {
                const docRef = doc(db, 'jobs', jobId);
                const snapshot = await getDoc(docRef);
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    let resolvedCustomerName = data.customerName || initialContext?.customerName;
                    let resolvedVehicleDetails = data.vehicleDetails || initialContext?.vehicleDetails;
                    let logs: string[] = [];

                    // Support legacy jobs without denormalized fields
                    if (!resolvedCustomerName && data.customerId) {
                        logs.push(`Legacy customer fetch for id: ${data.customerId}`);
                        try {
                            const cSnap = await getDoc(doc(db, 'customers', data.customerId));
                            if (cSnap.exists()) {
                                const cData = cSnap.data();
                                resolvedCustomerName = `${cData.firstName} ${cData.lastName}`.trim();
                                logs.push(`Legacy customer fetch SUCCESS: ${resolvedCustomerName}`);
                            } else {
                                logs.push(`Legacy customer fetch FAILED: doc does not exist in 'customers' collection`);
                            }
                        } catch (e: any) {
                            logs.push(`Legacy customer fetch ERROR: ${e.message}`);
                        }
                    }

                    if (!resolvedVehicleDetails && data.vehicleId) {
                        logs.push(`Legacy vehicle fetch for id: ${data.vehicleId}`);
                        try {
                            const vSnap = await getDoc(doc(db, 'vehicles', data.vehicleId));
                            if (vSnap.exists()) {
                                resolvedVehicleDetails = vSnap.data();
                                logs.push(`Legacy vehicle fetch SUCCESS`);
                            } else {
                                logs.push(`Legacy vehicle fetch FAILED: doc does not exist in 'vehicles' collection`);
                            }
                        } catch (e: any) {
                            logs.push(`Legacy vehicle fetch ERROR: ${e.message}`);
                        }
                    }

                    setJob({ 
                        id: snapshot.id, 
                        ...data,
                        customerName: resolvedCustomerName,
                        vehicleDetails: resolvedVehicleDetails,
                        poNumber: data.poNumber || (resolvedVehicleDetails?.fleetUnitNumber ? '' : undefined), // fallback
                        diagnosticLog: logs
                    });
                    setTasks(data.tasks || []);
                    if (data.taxRate !== undefined) setTaxRate(Number(data.taxRate));
                    if (data.discount !== undefined) setDiscount(Number(data.discount));

                    // Fetch associated data for this tenant
                    if (data.tenantId) {
                        try {
                            const q = query(collection(db, 'task_templates'), where('tenantId', '==', data.tenantId));
                            getDocs(q).then(tSnap => {
                                setTemplates(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                            });
                            
                            const invQ = query(collection(db, 'inventory_items'), where('tenantId', '==', data.tenantId));
                            onSnapshot(invQ, (snap) => {
                                setAllInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                            });
                            
                            getDoc(doc(db, 'businesses', data.tenantId)).then(snap => {
                                if (snap.exists()) {
                                    setDepartments(snap.data().departments || []);
                                }
                            }).catch(console.error);
                        } catch (e) {
                            console.error("Failed to load associated tenant data", e);
                        }
                    }
                } else {
                    toast.error("Job not found.");
                    onClose();
                }
            } catch (error) {
                console.error("Failed to load job:", error);
                toast.error("Failed to load job data.");
            }
            setLoading(false);
        };
        fetchJob();
    }, [jobId, onClose]);

    const handleAddTask = () => {
        setTasks([...tasks, {
            title: '',
            description: '',
            bookTime: 1, // Default 1 hour
            laborRate: laborRate,
            status: 'Not Started',
            parts: [],
            departmentId: '',
            notes: ''
        }]);
    };

    const handleRemoveTask = (index: number) => {
        if (!confirm('Are you sure you want to remove this task?')) return;
        const t = [...tasks];
        t.splice(index, 1);
        setTasks(t);
    };

    // Calculate Totals
    const calculateTotals = () => {
        const totalLaborCost = tasks.reduce((acc, t) => acc + (Number(t.bookTime || 0) * Number(t.laborRate || laborRate)), 0);
        
        const totalPartsCost = tasks.reduce((acc, t) => acc + (t.parts || []).reduce((pAcc: number, p: any) => {
            const discountedPrice = Number(p.price || 0) * (1 - (Number(p.discount || 0) / 100));
            return pAcc + (discountedPrice * Number(p.quantity || 1));
        }, 0), 0);

        const subtotal = totalLaborCost + totalPartsCost;
        const discountAmount = subtotal * (discount / 100);
        const subAfterDiscount = subtotal - discountAmount;
        const shopSupplies = totalLaborCost * (shopSuppliesRate / 100);
        const taxableAmount = subAfterDiscount + shopSupplies;
        const taxAmount = taxableAmount * (taxRate / 100);
        const grandTotal = taxableAmount + taxAmount;

        return {
            totalLaborCost,
            totalPartsCost,
            subtotal,
            discountAmount,
            shopSupplies,
            taxAmount,
            grandTotal
        };
    };

    const totals = calculateTotals();

    const handleSaveAndApprove = async () => {
        if (!jobId) return;
        setSubmitting(true);
        try {
            const serializedTasks = tasks.map(t => ({
                ...t,
                status: t.status || 'Not Started',
                partsTotal: (t.parts || []).reduce((acc: number, p: any) => acc + (Number(p.price || 0) * Number(p.quantity || 1)), 0)
            }));

            await updateDoc(doc(db, 'jobs', jobId), {
                tasks: serializedTasks,
                taxRate: taxRate,
                discount: discount,
                grandTotal: totals.grandTotal,
                totalLabor: totals.totalLaborCost,
                totalParts: totals.totalPartsCost,
                status: 'Pending Approval'
            });
            
            toast.success("Quote finalized and advanced successfully.");
            onComplete();
        } catch (error) {
            console.error("Save error:", error);
            toast.error("Failed to save estimate.");
        }
        setSubmitting(false);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 h-64 border border-zinc-800 rounded-3xl bg-zinc-900 shadow-xl">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Loading Draft...</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden flex flex-col h-full max-h-[85vh]">
            {/* Header */}
            {!isEmbedded && (
                <div className="bg-zinc-950 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-800 gap-4 shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
                            <Calculator className="w-6 h-6 text-indigo-400" /> Estimate Builder Wizard
                        </h2>
                        <p className="text-sm text-zinc-400 mt-1">
                            Build line items and configure quote for <strong className="text-zinc-200">{job?.title || 'Unknown Job'}</strong>
                        </p>
                    </div>
                </div>
            )}

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-zinc-950/30">
                <div className="max-w-4xl mx-auto space-y-8">

                    {/* Diagnostic DB Overlay */}
                    {/* Context Summary */}
                    {(job?.customerName || job?.vehicleDetails || initialContext) && (
                        <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-zinc-800/50">
                            {(job?.customerName || initialContext?.customerName) && (
                                <div className="flex items-center gap-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-lg text-sm font-bold">
                                    <User className="w-4 h-4" />
                                    {job?.customerName || initialContext?.customerName}
                                </div>
                            )}
                            {(job?.vehicleDetails || initialContext?.vehicleDetails) && (
                                <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-sm font-bold">
                                    <Truck className="w-4 h-4" />
                                    {job?.vehicleDetails ? 
                                        [job.vehicleDetails.year, job.vehicleDetails.make, job.vehicleDetails.model].filter(Boolean).join(' ') 
                                        : initialContext?.vehicleDetails ? 
                                        [initialContext.vehicleDetails.year, initialContext.vehicleDetails.make, initialContext.vehicleDetails.model].filter(Boolean).join(' ') 
                                        : 'Unknown Vehicle'}
                                    {(job?.vehicleDetails?.vin || initialContext?.vehicleDetails?.vin) && (
                                        <span className="opacity-50 text-xs ml-1 font-mono">
                                            ({(job?.vehicleDetails?.vin || initialContext?.vehicleDetails?.vin).slice(-6)})
                                        </span>
                                    )}
                                </div>
                            )}
                            {(job?.vehicleDetails?.fleetUnitNumber || initialContext?.vehicleDetails?.fleetUnitNumber) && (
                                <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wide">
                                    <Briefcase className="w-4 h-4" />
                                    Unit: {job?.vehicleDetails?.fleetUnitNumber || initialContext?.vehicleDetails?.fleetUnitNumber}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tasks List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Line Items (Tasks)</h3>
                            <div className="flex items-center gap-3">
                                {templates.length > 0 && (
                                    <div className="relative">
                                        <select 
                                            value=""
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (!val) return;
                                                const tpl = templates.find(t => t.id === val);
                                                if (tpl) {
                                                    const liveParts = ((tpl.parts || tpl.defaultParts) || []).map((tp: any) => {
                                                        const matchingInv = allInventory.find((inv: any) => inv.id === tp.inventoryId || inv.id === tp.id);
                                                        if (matchingInv) {
                                                            return { ...tp, price: matchingInv.price, cost: matchingInv.cost || 0, name: matchingInv.name, providedBy: 'Shop' };
                                                        }
                                                        return { ...tp, providedBy: 'Shop' };
                                                    });
                                                    setTasks([...tasks, {
                                                        title: tpl.title || '',
                                                        description: tpl.description || '',
                                                        bookTime: tpl.bookTime || 1,
                                                        laborRate: tpl.laborRate || laborRate,
                                                        status: 'Not Started',
                                                        departmentId: '',
                                                        notes: tpl.notes || '',
                                                        parts: liveParts,
                                                    }]);
                                                }
                                                e.target.value = "";
                                            }}
                                            className="appearance-none bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-lg pl-4 pr-10 py-2 text-xs font-bold uppercase tracking-wide text-zinc-300 hover:text-white transition-colors focus:outline-none cursor-pointer"
                                        >
                                            <option value="" className="bg-zinc-900 text-white">⚙️ Template Task</option>
                                            {templates.map(t => (
                                                <option key={t.id} value={t.id} className="bg-zinc-900 text-white">{t.title} ({t.bookTime}h)</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <button
                                    onClick={handleAddTask}
                                    className="bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-600/30 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-widest transition-colors flex items-center gap-2 border border-indigo-500/30"
                                >
                                    <Plus className="w-4 h-4" /> Custom Task
                                </button>
                            </div>
                        </div>

                        {tasks.length === 0 ? (
                            <div className="border border-zinc-800 border-dashed rounded-xl p-8 text-center bg-zinc-900/50">
                                <p className="text-zinc-500 font-medium">No line items added yet.</p>
                                <p className="text-xs text-zinc-600 mt-1">Click above to start building the quote.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {tasks.map((task, idx) => {
                                    const taskPartsValue = (task.parts || []).reduce((acc: number, p: any) => {
                                        const discountedPrice = Number(p.price || 0) * (1 - (Number(p.discount || 0) / 100));
                                        return acc + (discountedPrice * Number(p.quantity || 1));
                                    }, 0);
                                    const taskActualValue = (task.parts || []).reduce((acc: number, p: any) => acc + (Number(p.cost || p.price || 0) * Number(p.quantity || 1)), 0);
                                    const taskQuotedValue = (Number(task.bookTime || 0) * Number(task.laborRate || 0)) + taskPartsValue;
                                    
                                    return (
                                        <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg group transition-all duration-300">
                                            <div className="bg-zinc-900/50 p-4 border-b border-zinc-800/60 flex flex-col gap-4">
                                                <div className="w-full">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest shadow-sm">Task Name / Procedure</label>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleRemoveTask(idx)}
                                                                className="text-zinc-600 hover:text-red-500 transition-colors p-1"
                                                                title="Remove Task"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={task.title}
                                                        onChange={(e) => {
                                                            const t = [...tasks]; t[idx].title = e.target.value; setTasks(t);
                                                        }}
                                                        placeholder="Task Title (e.g. Brake Service)"
                                                        className="w-full bg-transparent border-b border-zinc-800 pb-2 text-xl md:text-2xl font-black tracking-tight text-white focus:outline-none focus:border-indigo-500 placeholder-zinc-700 mt-2"
                                                    />
                                                </div>
                                                
                                                <div className="flex flex-col md:flex-row justify-between gap-4 pt-1">
                                                    <div className="flex items-start gap-6">
                                                        <div className="w-32 md:w-48">
                                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 flex items-center gap-1">Department</label>
                                                            <select
                                                                value={task.departmentId || ''}
                                                                onChange={e => {
                                                                    const deptId = String(e.target.value);
                                                                    const t = [...tasks];
                                                                    t[idx].departmentId = deptId;
                                                                    if (deptId && departments) {
                                                                        const dept = departments.find((d: any) => String(d.id) === deptId);
                                                                        if (dept) t[idx].laborRate = Number(dept.standardShopRate) || laborRate;
                                                                    } else {
                                                                        t[idx].laborRate = laborRate;
                                                                    }
                                                                    setTasks(t);
                                                                    setHighlightedRates(prev => ({ ...prev, [idx]: true }));
                                                                    setTimeout(() => setHighlightedRates(prev => ({ ...prev, [idx]: false })), 1000);
                                                                }}
                                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                            >
                                                                <option value="" className="bg-zinc-900 text-white">Global / None</option>
                                                                {departments.map((d: any) => (
                                                                    <option key={d.id} value={d.id} className="bg-zinc-900 text-white">{d.name || 'Unnamed Department'}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="w-24 pl-6 border-l border-zinc-800/60">
                                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 flex items-center gap-1">Hrs <Info className="w-3 h-3 text-zinc-600" /></label>
                                                            <input
                                                                type="number"
                                                                min="0" step="0.5"
                                                                value={task.bookTime}
                                                                onChange={e => {
                                                                    const t = [...tasks]; t[idx].bookTime = parseFloat(e.target.value) || 0; setTasks(t);
                                                                }}
                                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                                                            />
                                                        </div>
                                                        <div className="w-28 pl-6 border-l border-zinc-800/60">
                                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1 flex items-center gap-1">Rate ($)</label>
                                                            <input
                                                                type="number"
                                                                min="0" step="10"
                                                                value={task.laborRate}
                                                                onChange={e => {
                                                                    const t = [...tasks]; t[idx].laborRate = parseFloat(e.target.value) || 0; setTasks(t);
                                                                }}
                                                                className={`w-full bg-zinc-900 border rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center transition-all duration-700 ${highlightedRates[idx] ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 scale-[1.02] shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-zinc-800'}`}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-6 md:pl-6 md:border-l border-zinc-800/60 pt-4 md:pt-0 border-t md:border-t-0 mt-2 md:mt-0">
                                                        <div className="flex flex-col flex-1 md:flex-none justify-center items-end pr-6 md:pr-4 md:mr-4 border-r border-zinc-800/60">
                                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1" title="Quoted Hours x Rate + Parts">Approved Est</label>
                                                            <span className="font-mono text-zinc-300 font-black text-xl tracking-tight">${taskQuotedValue.toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex flex-col flex-1 md:flex-none justify-center items-end">
                                                            <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1" title="Estimated Parts Cost">Actual Cost</label>
                                                            <span className="font-mono font-black text-xl tracking-tight text-emerald-400">${taskActualValue.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-4 bg-zinc-950 border-b border-zinc-800/50">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest flex items-center gap-2">
                                                        <Box className="w-3.5 h-3.5" /> Associated Parts
                                                    </span>
                                                </div>

                                                {(!task.parts || task.parts.length === 0) ? (
                                                    <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-4 flex gap-4 items-center text-sm font-mono text-zinc-500">
                                                        No parts added.
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={() => {
                                                                const t = [...tasks];
                                                                if (!t[idx].parts) t[idx].parts = [];
                                                                t[idx].parts.push({ name: '', quantity: 1, cost: 0, price: 0, discount: 0, providedBy: 'Shop' });
                                                                setTasks(t);
                                                            }} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1.5 rounded transition-colors text-xs font-mono tracking-widest uppercase flex items-center gap-2">
                                                                <PlusCircle className="w-3 h-3" /> Part from Inventory
                                                            </button>
                                                            <button type="button" onClick={() => {
                                                                const t = [...tasks];
                                                                if (!t[idx].parts) t[idx].parts = [];
                                                                t[idx].parts.push({ name: '', quantity: 1, cost: 0, price: 0, discount: 0, providedBy: 'Customer' });
                                                                setTasks(t);
                                                            }} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold px-3 py-1.5 rounded transition-colors text-xs font-mono tracking-widest uppercase flex items-center gap-2 border border-amber-500/20">
                                                                <UserPlus className="w-3 h-3" /> + Customer Part
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {task.parts.map((part: any, pIdx: number) => (
                                                            <div key={pIdx} className={`flex gap-2 items-center bg-zinc-900 border ${part.providedBy === 'Customer' ? 'border-amber-500/30 bg-amber-500/5' : 'border-zinc-800'} rounded-xl p-2 group/part`}>
                                                                <div className="flex-1 flex items-center border-r border-zinc-800/60 pr-2">
                                                                    {part.providedBy === 'Customer' && (
                                                                        <div className="pl-2 pr-1">
                                                                            <span className="text-[9px] font-black tracking-widest uppercase text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">CUST</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex-1 min-w-0">
                                                                        {part.providedBy === 'Customer' ? (
                                                                            <input
                                                                                type="text"
                                                                                value={part.name}
                                                                                onChange={e => {
                                                                                    const t = [...tasks];
                                                                                    t[idx].parts[pIdx].name = e.target.value;
                                                                                    setTasks(t);
                                                                                }}
                                                                                placeholder="Describe customer part..."
                                                                                className="w-full bg-transparent border-none text-sm text-white focus:outline-none h-8 px-2"
                                                                            />
                                                                        ) : (
                                                                            <InventorySelector
                                                                                data={allInventory}
                                                                                autoOpen={!part.inventoryId && !part.name && part.price === 0}
                                                                                onChange={(_, invItem) => {
                                                                                    if (!invItem) return;
                                                                                    const t = [...tasks];
                                                                                    const isDuplicate = t[idx].parts.some((p: any, i: number) => i !== pIdx && p.inventoryId === invItem.id);
                                                                                    if (isDuplicate) {
                                                                                        toast.error("Part already assigned to this task. Update quantity.");
                                                                                        return;
                                                                                    }
                                                                                    t[idx].parts[pIdx].name = invItem.name;
                                                                                    t[idx].parts[pIdx].cost = invItem.cost || 0;
                                                                                    t[idx].parts[pIdx].price = invItem.price || 0;
                                                                                    t[idx].parts[pIdx].discount = 0;
                                                                                    t[idx].parts[pIdx].inventoryId = invItem.id;
                                                                                    setTasks(t);
                                                                                }}
                                                                                value={part.inventoryId}
                                                                                alreadyInTaskIds={(task.parts || []).map((p: any) => p.inventoryId).filter(Boolean)}
                                                                                placeholder="Search inventory or type description..."
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="w-16 border-l border-zinc-800 pl-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Qty</span>
                                                                        <input type="number" min="1" value={part.quantity} onChange={e => {
                                                                            const t = [...tasks]; t[idx].parts[pIdx].quantity = parseFloat(e.target.value) || 0; setTasks(t);
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none text-left" />
                                                                    </div>
                                                                </div>
                                                                <div className="w-20 border-l border-zinc-800 pl-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Cost($)</span>
                                                                        <input type="number" min="0" step="0.01" disabled={part.providedBy === 'Customer'} value={part.cost || 0} onChange={e => {
                                                                            const t = [...tasks]; t[idx].parts[pIdx].cost = parseFloat(e.target.value) || 0; setTasks(t);
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-zinc-400 font-mono focus:outline-none text-left disabled:opacity-50" />
                                                                    </div>
                                                                </div>
                                                                <div className="w-24 border-l border-zinc-800 pl-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Price($)</span>
                                                                        <input type="number" min="0" step="0.01" disabled={part.providedBy === 'Customer'} value={part.price} onChange={e => {
                                                                            const t = [...tasks]; t[idx].parts[pIdx].price = parseFloat(e.target.value) || 0; setTasks(t);
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none text-left disabled:opacity-50" />
                                                                    </div>
                                                                </div>
                                                                <div className="w-16 border-l border-zinc-800 pl-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase px-1">Disc(%)</span>
                                                                        <input type="number" min="0" max="100" disabled={part.providedBy === 'Customer'} value={part.discount || 0} onChange={e => {
                                                                            const t = [...tasks]; t[idx].parts[pIdx].discount = parseFloat(e.target.value) || 0; setTasks(t);
                                                                        }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-amber-400 font-mono focus:outline-none text-left disabled:opacity-50" />
                                                                    </div>
                                                                </div>
                                                                <div className="font-mono text-zinc-300 font-black text-sm w-24 text-right pr-2">
                                                                    ${((Number(part.price) * (1 - (Number(part.discount || 0) / 100))) * Number(part.quantity)).toFixed(2)}
                                                                </div>
                                                                <button type="button" onClick={() => {
                                                                    const t = [...tasks]; t[idx].parts.splice(pIdx, 1); setTasks(t);
                                                                }} className="p-1.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded-lg transition-colors opacity-0 group-hover/part:opacity-100">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <div className="pt-2 flex gap-2">
                                                            <button type="button" onClick={() => {
                                                                const t = [...tasks];
                                                                t[idx].parts.push({ name: '', quantity: 1, cost: 0, price: 0, discount: 0, providedBy: 'Shop' });
                                                                setTasks(t);
                                                            }} className="text-[10px] text-zinc-400 hover:text-white font-black font-mono tracking-widest uppercase flex items-center gap-1.5 transition-colors border border-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-800">
                                                                <PlusCircle className="w-3 h-3" /> Part from Inventory
                                                            </button>
                                                            <button type="button" onClick={() => {
                                                                const t = [...tasks];
                                                                t[idx].parts.push({ name: '', quantity: 1, cost: 0, price: 0, discount: 0, providedBy: 'Customer' });
                                                                setTasks(t);
                                                            }} className="text-[10px] text-amber-500/70 hover:text-amber-400 font-black font-mono tracking-widest uppercase flex items-center gap-1.5 transition-colors border border-amber-500/10 px-3 py-1.5 rounded-lg hover:bg-amber-500/5">
                                                                <UserPlus className="w-3 h-3" /> + Customer Part
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-4 bg-zinc-950 border-t border-zinc-800/50">
                                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5">Scope Notes (Internal)</label>
                                                <textarea
                                                    value={task.notes || ''}
                                                    onChange={(e) => {
                                                        const t = [...tasks]; t[idx].notes = e.target.value; setTasks(t);
                                                    }}
                                                    placeholder="Private details, warnings, or specific tools..."
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-y min-h-[60px] placeholder-zinc-700"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Financial Settings and Totals */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-indigo-950/20 border border-indigo-500/20 p-6 rounded-3xl">
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-widest">Financial Settings</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1.5">Sales Tax (%)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={taxRate}
                                            onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                                            className="w-full bg-zinc-950/80 border border-indigo-500/30 rounded-lg pr-8 pl-4 py-2.5 text-sm font-mono text-indigo-300 focus:border-indigo-500 focus:outline-none"
                                        />
                                        <span className="absolute right-3 top-2.5 text-xs text-zinc-600 font-bold">%</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1.5">Discount (%)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={discount}
                                            onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                                            className="w-full bg-zinc-950/80 border border-indigo-500/30 rounded-lg pr-8 pl-4 py-2.5 text-sm font-mono text-green-400 focus:border-indigo-500 focus:outline-none"
                                        />
                                        <span className="absolute right-3 top-2.5 text-xs text-zinc-600 font-bold">%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-indigo-600 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-end">
                            <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                            
                            <div className="space-y-2 mb-4 relative z-10 text-sm font-mono">
                                <div className="flex justify-between items-center text-indigo-200">
                                    <span>Labor</span>
                                    <span>${totals.totalLaborCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-indigo-200">
                                    <span>Parts</span>
                                    <span>${totals.totalPartsCost.toFixed(2)}</span>
                                </div>
                                {totals.shopSupplies > 0 && (
                                    <div className="flex justify-between items-center text-indigo-200">
                                        <span>Shop Supplies ({shopSuppliesRate}%)</span>
                                        <span>${totals.shopSupplies.toFixed(2)}</span>
                                    </div>
                                )}
                                {totals.discountAmount > 0 && (
                                    <div className="flex justify-between items-center text-green-300">
                                        <span>Discount ({discount}%)</span>
                                        <span>-${totals.discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center text-indigo-300 border-t border-white/20 pt-2 mt-2">
                                    <span>Tax ({taxRate}%)</span>
                                    <span>${totals.taxAmount.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="flex items-end justify-between border-t border-white/30 pt-3 relative z-10">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Quoted Total</span>
                                <span className="text-4xl font-black">${totals.grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Footer Action */}
            <div className="p-6 bg-zinc-950 border-t border-zinc-800 shrink-0 flex items-center justify-between">
                <button
                    onClick={onClose}
                    className="text-zinc-400 hover:text-white text-sm font-bold uppercase tracking-widest transition-colors px-4 py-2"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSaveAndApprove}
                    disabled={submitting || tasks.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2 uppercase tracking-widest text-sm"
                >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                    Lock Quote & Continue
                </button>
            </div>
        </div>
    );
}
