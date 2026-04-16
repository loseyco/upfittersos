import { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { PrintPreviewModal } from '../../pages/business/estimates/PrintPreviewModal';

export function QuoteApprovalModal({ job, onClose, customer, vehicle }: { job: any, onClose: () => void, customer?: any, vehicle?: any }) {
    const { tenantId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [businessSettings, setBusinessSettings] = useState<any>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        import('firebase/firestore').then(({ doc, getDoc }) => {
            import('../../lib/firebase').then(({ db }) => {
                getDoc(doc(db, 'businesses', tenantId)).then(snapshot => {
                    if (snapshot.exists()) {
                        console.log("Loaded raw business data from firestore:", snapshot.data());
                        setBusinessSettings(snapshot.data());
                    }
                }).catch(err => console.error("Firestore getDoc error:", err));
            });
        });
    }, [tenantId]);

    const handleDeny = async () => {
        if (!window.confirm("Move this back to Estimate constraints?")) return;
        setLoading(true);
        try {
            await api.put(`/jobs/${job.id}`, { status: 'Estimate', tenantId });
            toast.success("Job updated to Estimate");
            onClose();
        } catch (e) {
            toast.error("Failed to deny job");
            setLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!window.confirm("Approve quote? This converts the Estimate into an active Work Order.")) return;
        setLoading(true);
        try {
            if (job.isChangeOrder) {
                toast.loading("Merging Change Order into Parent Project...", { id: 'merge' });
                await api.post(`/jobs/${job.id}/merge`);
                toast.success("Change Order Approved & Merged!", { id: 'merge' });
            } else {
                await api.put(`/jobs/${job.id}`, { status: 'Pending Intake', tenantId });
                toast.success("Quote Approved! Converted to Work Order.");
            }
            onClose();
        } catch (e) {
            toast.error("Failed to process approval.");
            setLoading(false);
        }
    };

    const handleArchive = async () => {
        if (!window.confirm("Archive this permanently?")) return;
        setLoading(true);
        try {
            await api.put(`/jobs/${job.id}`, { archived: true, tenantId });
            toast.success("Quote Archived.");
            onClose();
        } catch (e) {
            toast.error("Failed to archive.");
        } finally {
            setLoading(false);
        }
    };

    let totalLaborAccum = 0;
    let totalPartsAccum = 0;

    const computeTaskTotal = (t: any) => {
        const labor = Number(t.bookTime || t.hours || 0) * Number(t.laborRate || t.rate || 0);
        const parts = (t.parts || []).reduce((pAcc: number, p: any) => {
            const pPrice = Number(p.price || 0);
            const pQty = Number(p.quantity || p.qty || 1);
            const pDisc = Number(p.discount || 0);
            const discountedPrice = pPrice * (1 - (pDisc / 100));
            return pAcc + (discountedPrice * pQty);
        }, 0);
        totalLaborAccum += labor;
        totalPartsAccum += parts;
        return labor + parts;
    };

    const taskSubtotals = job?.tasks?.map((t: any) => computeTaskTotal(t)) || [];
    const subtotal = taskSubtotals.reduce((sum: number, val: number) => sum + val, 0);

    const jobSop = Number(job?.sopSupplies) || 0;
    const jobShipping = Number(job?.shipping) || 0;
    const jobDiscountPercent = Number(job?.discount) || 0;

    const subBeforeDiscount = subtotal + jobSop + jobShipping;
    const jobDiscountAmt = subBeforeDiscount * (jobDiscountPercent / 100);
    const taxableAmount = subBeforeDiscount - jobDiscountAmt;

    const taxRate = Number(job?.lockedTaxRate || customer?.taxRate || '8.25') / 100;
    const taxes = taxableAmount * taxRate;
    const gTotal = taxableAmount + taxes;

    return (
        <>
        {showPrintPreview && (
            <PrintPreviewModal 
                job={job} 
                jobId={job?.id}
                customer={customer} 
                vehicle={vehicle} 
                onClose={() => setShowPrintPreview(false)} 
                businessSettings={businessSettings}
                partsTotal={totalPartsAccum}
                laborTotal={totalLaborAccum}
                discountAmount={jobDiscountAmt}
                taxes={taxes}
                grandTotal={gTotal}
            />
        )}
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4 sm:p-6 overflow-y-auto">
            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in relative flex flex-col max-h-full">
                
                <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-500 text-[10px] font-black uppercase tracking-widest rounded-full mb-3 border border-amber-500/50">
                            <AlertTriangle className="w-3 h-3" /> Customer Approval Needed
                        </div>
                        <h2 className="text-3xl font-black text-white tracking-tight leading-none mb-4">{job.title || 'Untitled Estimate'}</h2>
                        <button 
                            onClick={() => setShowPrintPreview(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all uppercase tracking-widest text-xs mt-2"
                        >
                            <Printer className="w-4 h-4" /> Print Estimate
                        </button>
                    </div>
                    <button onClick={onClose} className="p-2 bg-zinc-800 hover:bg-zinc-700/80 rounded-full text-zinc-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                    {/* Customer & Vehicle info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest font-black mb-1">Customer</div>
                            <div className="text-white font-bold">{customer ? `${customer.firstName} ${customer.lastName}` : 'Walk-in Customer'}</div>
                            {customer?.phone && <div className="text-sm text-zinc-400">{customer.phone}</div>}
                        </div>
                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest font-black mb-1">Vehicle</div>
                            <div className="text-white font-bold">{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle'}</div>
                            {vehicle?.vin && <div className="text-sm text-zinc-400">VIN: {vehicle.vin}</div>}
                        </div>
                    </div>

                    {/* Summary of tasks */}
                    <div>
                        <div className="text-xs text-zinc-500 uppercase tracking-widest font-black mb-3 pl-1">Scope of Work</div>
                        <div className="space-y-2">
                            {(!job?.tasks || job.tasks.length === 0) && (
                                <div className="text-zinc-500 text-sm italic py-2">No tasks defined</div>
                            )}
                            {job?.tasks?.map((t: any, i: number) => (
                                <div key={i} className="flex justify-between items-center p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                                    <div>
                                        <div className="text-zinc-200 font-bold">{t.title}</div>
                                        {t.description && <div className="text-zinc-500 text-xs mt-1 line-clamp-1">{t.description}</div>}
                                    </div>
                                    <div className="text-white font-black text-lg font-mono">
                                        ${computeTaskTotal(t).toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-zinc-800 flex justify-end">
                        <div className="w-full max-w-sm">
                            <div className="space-y-1.5 mb-4 text-xs font-mono">
                                <div className="flex justify-between items-center text-zinc-400">
                                    <span>Subtotal:</span>
                                    <span>${subtotal.toFixed(2)}</span>
                                </div>
                                {jobSop > 0 && (
                                    <div className="flex justify-between items-center text-zinc-400">
                                        <span>Shop Supplies:</span>
                                        <span>${jobSop.toFixed(2)}</span>
                                    </div>
                                )}
                                {jobShipping > 0 && (
                                    <div className="flex justify-between items-center text-zinc-400">
                                        <span>Shipping/Freight:</span>
                                        <span>${jobShipping.toFixed(2)}</span>
                                    </div>
                                )}
                                {jobDiscountAmt > 0 && (
                                    <div className="flex justify-between items-center text-emerald-400">
                                        <span>Discount ({jobDiscountPercent}%):</span>
                                        <span>-${jobDiscountAmt.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center text-zinc-400 border-b border-zinc-800/50 pb-2">
                                    <span>Tax ({(taxRate * 100).toFixed(2)}%):</span>
                                    <span>${taxes.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Total Quote Amount</div>
                                <div className="text-4xl font-black text-emerald-400">${gTotal.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-zinc-800 bg-zinc-900/80">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <button 
                            disabled={loading}
                            onClick={handleDeny} 
                            className="py-4 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-500 hover:text-red-400 font-black tracking-widest uppercase text-sm shadow-xl flex justify-center items-center gap-2 transition-all disabled:opacity-50"
                        >
                            <X className="w-5 h-5" /> Deny & Revise
                        </button>
                        <button 
                            disabled={loading}
                            onClick={handleApprove} 
                            className="py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase text-sm shadow-xl flex justify-center items-center gap-2 transition-all disabled:opacity-50"
                        >
                            <CheckCircle className="w-5 h-5" /> Approve to WO
                        </button>
                    </div>
                    <div className="text-center">
                        <button disabled={loading} onClick={handleArchive} className="text-[10px] text-zinc-600 hover:text-zinc-400 font-bold uppercase tracking-widest transition-colors mb-2">
                            Customer permanently denied (Archive Job)
                        </button>
                    </div>
                </div>

            </div>
        </div>
        </>
    );
}
