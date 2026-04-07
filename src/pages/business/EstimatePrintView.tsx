import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Truck, Phone, FileText } from 'lucide-react';

export function EstimatePrintView() {
    const { tenantId, jobId } = useParams();
    const [job, setJob] = useState<any>(null);
    const [customer, setCustomer] = useState<any>(null);
    const [vehicle, setVehicle] = useState<any>(null);
    const [tenant, setTenant] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (!tenantId || !jobId) return;
            try {
                // Fetch Job
                const jobSnap = await getDoc(doc(db, 'jobs', jobId));
                if (jobSnap.exists()) {
                    const jData = jobSnap.data();
                    setJob(jData);

                    // Fetch Customer
                    if (jData.customerId) {
                        const custSnap = await getDoc(doc(db, 'customers', jData.customerId));
                        if (custSnap.exists()) setCustomer(custSnap.data());
                    }

                    // Fetch Vehicle
                    if (jData.vehicleId) {
                        const vehSnap = await getDoc(doc(db, 'vehicles', jData.vehicleId));
                        if (vehSnap.exists()) setVehicle(vehSnap.data());
                    }
                }

                // Fetch Tenant Info
                const tenantSnap = await getDoc(doc(db, 'businesses', tenantId));
                if (tenantSnap.exists()) {
                    setTenant(tenantSnap.data());
                }

                setLoading(false);

                // Auto Trigger Print Dialog slightly after load to ensure styles catch up
                setTimeout(() => {
                    window.print();
                }, 1000);

            } catch(e) {
                console.error("Failed to load estimate", e);
                setLoading(false);
            }
        };
        loadData();
    }, [tenantId, jobId]);

    if (loading) return <div className="p-10 font-mono text-zinc-500">Loading Estimate Data...</div>;
    if (!job) return <div className="p-10 font-mono text-red-500">Error: Could not find Job Estimate.</div>;

    // Calculate Totals using same logic
    const calculatePartsTotal = () => {
        const legacyParts = job.parts?.reduce((acc: any, part: any) => acc + (Number(part.price) * Number(part.quantity)), 0) || 0;
        const tasksParts = job.tasks?.reduce((tAcc: any, task: any) => {
             return tAcc + (task.parts || []).reduce((pAcc: any, part: any) => pAcc + (Number(part.price) * Number(part.quantity)), 0);
        }, 0) || 0;
        return legacyParts + tasksParts;
    };
    
    const calculateLaborTotal = () => {
        const legacyLabor = job.laborLines?.reduce((acc: any, line: any) => acc + (Number(line.rate) * Number(line.hours)), 0) || 0;
        const tasksLabor = job.tasks?.reduce((tAcc: any, task: any) => {
             return tAcc + (Number(task.bookTime) * Number(task.laborRate || 0));
        }, 0) || 0;
        return legacyLabor + tasksLabor;
    };

    const partsTotal = calculatePartsTotal();
    const laborTotal = calculateLaborTotal();
    const subTotal = partsTotal + laborTotal;
    const txRateDecimal = customer?.taxRate !== undefined && customer?.taxRate !== '' ? (Number(customer.taxRate) / 100) : 0.0825;
    const taxes = subTotal * txRateDecimal;
    const grandTotal = subTotal + taxes;

    return (
        <div className="bg-white min-h-screen text-black p-8 md:p-12 print:p-0 print:m-0 max-w-4xl mx-auto font-sans">
            
            {/* Header */}
            <div className="flex justify-between items-start mb-12 border-b-2 border-zinc-900 pb-8">
                <div>
                    <h1 className="text-4xl font-black tracking-tight mb-2 uppercase">{tenant?.name || 'Upfitters OS'}</h1>
                    <p className="text-zinc-600 font-medium text-sm max-w-xs">{tenant?.address || '123 Main St, Anytown USA'}</p>
                    <p className="text-zinc-600 font-medium text-sm flex items-center gap-1 mt-1"><Phone className="w-3 h-3"/> {tenant?.phone || '(555) 555-5555'}</p>
                </div>
                <div className="text-right">
                    <h2 className="text-4xl font-black text-zinc-300 uppercase tracking-widest">{job.status === 'Estimate' ? 'Estimate' : 'Invoice'}</h2>
                    <p className="text-zinc-500 font-mono mt-2 font-medium">#{jobId ? jobId.substring(0,8).toUpperCase() : 'UNKNOWN'}</p>
                    <p className="text-zinc-500 font-mono text-sm">Date: {new Date().toLocaleDateString()}</p>
                </div>
            </div>

            {/* Entity Info */}
            <div className="grid grid-cols-2 gap-12 mb-12">
                <div>
                    <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-200 pb-2 mb-4">Customer Summary</h3>
                    {customer ? (
                        <div className="space-y-1">
                            <p className="font-bold text-lg">{customer.firstName} {customer.lastName}</p>
                            {customer.company && <p className="text-zinc-600 font-medium">{customer.company}</p>}
                            {customer.phone && <p className="text-zinc-500 text-sm">{customer.phone}</p>}
                            {customer.email && <p className="text-zinc-500 text-sm">{customer.email}</p>}
                            {customer.address && <p className="text-zinc-500 text-sm max-w-xs mt-1">{customer.address}</p>}
                        </div>
                    ) : (
                        <p className="text-zinc-400 italic font-medium">No Customer Assigned</p>
                    )}
                </div>
                <div>
                    <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-200 pb-2 mb-4">Target Vehicle / Asset</h3>
                    {vehicle ? (
                        <div className="space-y-1 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                            <p className="font-bold text-lg flex items-center gap-2"><Truck className="w-5 h-5 text-zinc-400"/> {vehicle.year} {vehicle.make} {vehicle.model}</p>
                            <p className="text-zinc-500 text-sm font-mono mt-2">VIN: {vehicle.vin || 'N/A'}</p>
                            {vehicle.licensePlate && <p className="text-zinc-500 text-sm font-mono mt-1">Plate: {vehicle.licensePlate}</p>}
                        </div>
                    ) : (
                        <p className="text-zinc-400 italic font-medium">No Vehicle Assigned</p>
                    )}
                </div>
            </div>

            {/* Scope */}
            <div className="mb-12">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-200 pb-2 mb-4">Target Scope of Work</h3>
                <h4 className="font-bold text-xl mb-2">{job.title || 'Untitled Scope'}</h4>
                {job.description && (
                    <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                        {job.description}
                    </p>
                )}
            </div>

            {/* Line Items Table */}
            <div className="mb-12">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-900 pb-2 mb-4">Itemized Breakdown</h3>
                
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-zinc-200">
                            <th className="py-3 px-2 font-bold text-xs uppercase tracking-widest text-zinc-500 w-1/2">Task / Item Description</th>
                            <th className="py-3 px-2 font-bold text-xs uppercase tracking-widest text-zinc-500">Qty / Hrs</th>
                            <th className="py-3 px-2 font-bold text-xs uppercase tracking-widest text-zinc-500">Rate</th>
                            <th className="py-3 px-2 font-bold text-xs uppercase tracking-widest text-zinc-500 text-right">Ext. Amount</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm font-medium text-zinc-800 border-b-2 border-zinc-900">
                        {/* Tasks loop */}
                        {job.tasks?.map((t: any, idx: number) => {
                            const taskLaborExt = Number(t.bookTime || 0) * Number(t.laborRate || 0);
                            return (
                                <React.Fragment key={`t-${idx}`}>
                                    {/* Task Labor Row */}
                                    <tr className="border-b border-zinc-100/50">
                                        <td className="py-3 px-2 font-bold">{t.title || 'General Task Labor'} <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest">Labor</span></td>
                                        <td className="py-3 px-2 font-mono text-zinc-600">{t.bookTime || 0}</td>
                                        <td className="py-3 px-2 font-mono text-zinc-600">${Number(t.laborRate || 0).toFixed(2)}</td>
                                        <td className="py-3 px-2 font-mono font-bold text-right">${taskLaborExt.toFixed(2)}</td>
                                    </tr>
                                    {/* Task Parts */}
                                    {t.parts?.map((p: any, pIdx: number) => (
                                        <tr key={`tp-${idx}-${pIdx}`} className="border-b border-zinc-100/50">
                                            <td className="py-2 px-2 pl-6 text-zinc-600 flex items-center justify-between">
                                                <span>↳ {p.name || 'Unnamed Part'}</span>
                                                <span className="text-[10px] border border-zinc-200 text-zinc-500 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest">Part</span>
                                            </td>
                                            <td className="py-2 px-2 font-mono text-zinc-500">{p.quantity}</td>
                                            <td className="py-2 px-2 font-mono text-zinc-500">${Number(p.price).toFixed(2)}</td>
                                            <td className="py-2 px-2 font-mono text-zinc-600 text-right">${(Number(p.quantity) * Number(p.price)).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            )
                        })}

                        {/* Legacy Labor */}
                        {job.laborLines?.map((l: any, idx: number) => (
                            <tr key={`ll-${idx}`} className="border-b border-zinc-100/50">
                                <td className="py-3 px-2 font-bold">{l.description || 'Legacy Labor'} <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest">Labor</span></td>
                                <td className="py-3 px-2 font-mono text-zinc-600">{l.hours}</td>
                                <td className="py-3 px-2 font-mono text-zinc-600">${Number(l.rate).toFixed(2)}</td>
                                <td className="py-3 px-2 font-mono font-bold text-right">${(Number(l.hours) * Number(l.rate)).toFixed(2)}</td>
                            </tr>
                        ))}

                        {/* Legacy Parts */}
                        {job.parts?.map((p: any, pIdx: number) => (
                            <tr key={`lp-${pIdx}`} className="border-b border-zinc-100/50">
                                <td className="py-2 px-2 text-zinc-600 flex items-center justify-between">
                                    <span>{p.name || 'Legacy Part'}</span>
                                    <span className="text-[10px] border border-zinc-200 text-zinc-500 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest">Part</span>
                                </td>
                                <td className="py-2 px-2 font-mono text-zinc-500">{p.quantity}</td>
                                <td className="py-2 px-2 font-mono text-zinc-500">${Number(p.price).toFixed(2)}</td>
                                <td className="py-2 px-2 font-mono text-zinc-600 text-right">${(Number(p.quantity) * Number(p.price)).toFixed(2)}</td>
                            </tr>
                        ))}

                        {/* Fallback Empty */}
                        {!job.tasks?.length && !job.laborLines?.length && !job.parts?.length && (
                            <tr>
                                <td colSpan={4} className="py-6 text-center text-zinc-400 italic">No line items specified.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Totals Section */}
            <div className="flex justify-end mb-16">
                <div className="w-1/2">
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                        <span className="font-bold text-zinc-500 uppercase text-xs tracking-widest">Subtotal (Parts)</span>
                        <span className="font-mono text-zinc-800 font-bold">${partsTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                        <span className="font-bold text-zinc-500 uppercase text-xs tracking-widest">Subtotal (Labor)</span>
                        <span className="font-mono text-zinc-800 font-bold">${laborTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                        <span className="font-bold text-zinc-500 uppercase text-xs tracking-widest">Est. Taxes ({customer?.taxRate !== undefined && customer?.taxRate !== '' ? customer.taxRate : '8.25'}%)</span>
                        <span className="font-mono text-zinc-800 font-bold">${taxes.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-4 border-b-4 border-zinc-900 mt-2">
                        <span className="text-xl font-black uppercase">Grand Total</span>
                        <span className="font-mono text-2xl font-black">${grandTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Authorization Block */}
            <div className="mt-24 pt-8 border-t border-zinc-200">
                <h3 className="font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-zinc-400"/> General Authorization</h3>
                <p className="text-zinc-500 text-xs text-balance mb-12">
                    By signing below, I authorize the work outlined in this document to be performed. An express mechanic's lien is acknowledged on the vehicle to secure the amount of repairs thereto. 
                    Unless otherwise specified, this is an estimate and final costs may vary up to 10% without prior notice.
                </p>
                <div className="flex gap-8">
                    <div className="w-2/3 border-b-2 border-zinc-400 flex items-end pb-1">
                        <span className="text-xs uppercase font-bold text-zinc-400 tracking-widest">X</span>
                    </div>
                    <div className="w-1/3 border-b-2 border-zinc-400 flex items-end pb-1">
                        <span className="text-xs uppercase font-bold text-zinc-400 tracking-widest">Date</span>
                    </div>
                </div>
                <div className="flex gap-8 mt-2">
                    <div className="w-2/3">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest">Customer Signature</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
