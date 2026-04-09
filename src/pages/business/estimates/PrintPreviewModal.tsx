import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Phone, FileText, Printer, X } from 'lucide-react';

export function PrintPreviewModal({
    job,
    jobId,
    customer,
    vehicle,
    businessSettings,
    partsTotal,
    laborTotal,
    discountAmount,
    taxes,
    grandTotal,
    onClose
}: any) {

    const [printMode, setPrintMode] = React.useState<'customer' | 'technician'>('customer');

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Format the document title based on status
    const isEstimate = ['Estimate', 'Draft', 'Pending Approval'].includes(job.status);
    const documentTitle = printMode === 'technician' ? 'Technician Worksheet' : (isEstimate ? 'Estimate' : 'Invoice');
    const taxRateStr = job.lockedTaxRate !== undefined && job.lockedTaxRate !== null && job.lockedTaxRate !== '' 
        ? job.lockedTaxRate 
        : (customer?.taxRate !== undefined && customer?.taxRate !== '' ? customer.taxRate : '8.25');

    return createPortal(
        <div className="fixed inset-0 z-[999] bg-zinc-900/90 backdrop-blur-sm overflow-y-auto print:static print:inset-auto print:h-auto print:bg-white print:backdrop-blur-none print:z-auto print:overflow-visible text-black">
            
            {/* Modal Controls - Hidden when literally printing */}
            <div className="sticky top-0 z-[1000] bg-zinc-950/90 border-b border-zinc-800 p-4 flex justify-between items-center print:hidden shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                    <h2 className="text-white font-black uppercase tracking-widest text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-400" />
                        Print Preview
                    </h2>
                    
                    <div className="ml-8 flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                        <button
                            onClick={() => setPrintMode('customer')}
                            className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-md transition-colors ${printMode === 'customer' ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Customer Copy
                        </button>
                        <button
                            onClick={() => setPrintMode('technician')}
                            className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-md transition-colors ${printMode === 'technician' ? 'bg-amber-500/20 text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Tech Worksheet
                        </button>
                    </div>
                </div>
                <button 
                    onClick={() => window.print()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all font-mono uppercase tracking-widest text-xs"
                >
                    <Printer className="w-4 h-4" /> Print Document
                </button>
            </div>

            {/* The Printed Document Page */}
            {/* Tailwind "print:" utilities strip margins, shadows, and paddings for pure paper fit */}
            <div className="bg-white max-w-4xl mx-auto my-8 p-12 shadow-2xl rounded-2xl text-black font-sans print:m-0 print:p-0 print:shadow-none print:rounded-none">
                
                {/* Header */}
                <div className="flex justify-between items-start mb-12 border-b border-black pb-8 print:border-zinc-300">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight mb-2 uppercase text-black">{businessSettings?.name || 'Upfitters OS'}</h1>
                        <p className="text-zinc-600 font-medium text-sm max-w-xs block leading-relaxed mb-2">
                            {businessSettings?.addressStreet ? (
                                <>
                                    {businessSettings.addressStreet}<br/>
                                    {businessSettings.addressCity}, {businessSettings.addressState} {businessSettings.addressZip}
                                </>
                            ) : (
                                '123 Main St, Anytown USA'
                            )}
                        </p>
                        
                        <div className="flex flex-col gap-1">
                            {businessSettings?.phone && (
                                <p className="text-zinc-600 font-medium text-sm flex items-center gap-1.5">
                                    <Phone className="w-3 h-3 text-zinc-400"/> 
                                    {businessSettings.phone.length === 10 ? `(${businessSettings.phone.substring(0,3)}) ${businessSettings.phone.substring(3,6)}-${businessSettings.phone.substring(6,10)}` : businessSettings.phone}
                                </p>
                            )}
                            {businessSettings?.email && (
                                <p className="text-zinc-600 font-medium text-sm flex items-center gap-1.5"><Truck className="w-3 h-3 text-zinc-400"/> {businessSettings.email}</p>
                            )}
                            {businessSettings?.website && (
                                <p className="text-zinc-600 font-medium text-sm flex items-center gap-1.5"><FileText className="w-3 h-3 text-zinc-400"/> {businessSettings.website}</p>
                            )}
                            {!businessSettings?.phone && !businessSettings?.email && !businessSettings?.website && (
                                <p className="text-zinc-600 font-medium text-sm flex items-center gap-1.5"><Phone className="w-3 h-3"/> (555) 555-5555</p>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <h2 className="text-4xl font-black text-zinc-300 uppercase tracking-widest">{documentTitle}</h2>
                        <p className="text-zinc-500 font-mono mt-2 font-medium">#{jobId ? jobId.substring(0,8).toUpperCase() : 'UNKNOWN'}</p>
                        <p className="text-zinc-500 font-mono text-sm">Date: {new Date().toLocaleDateString()}</p>
                    </div>
                </div>

                {/* Entity Info */}
                <div className="grid grid-cols-2 gap-12 mb-12 print:break-inside-avoid">
                    <div>
                        <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-200 pb-2 mb-4">Customer Summary</h3>
                        {customer && customer.firstName ? (
                            <div className="space-y-1">
                                <p className="font-bold text-lg">{customer.firstName} {customer.lastName}</p>
                                {customer.company && <p className="text-zinc-600 font-medium">{customer.company}</p>}
                                {customer.phone && <p className="text-zinc-500 text-sm">{customer.phone}</p>}
                                {customer.email && <p className="text-zinc-500 text-sm">{customer.email}</p>}
                                {customer.addressStreet && (
                                    <p className="text-zinc-500 text-sm max-w-xs mt-1">
                                        {customer.addressStreet}{customer.addressCity ? `, ${customer.addressCity}` : ''} {customer.addressState} {customer.addressZip}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-zinc-400 italic font-medium">No Customer Assigned</p>
                        )}
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-200 pb-2 mb-4">Target Vehicle / Asset</h3>
                        {vehicle && vehicle.year ? (
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
                        <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed bg-zinc-50 p-4 rounded-xl border border-zinc-100 text-sm">
                            {job.description}
                        </p>
                    )}
                </div>

                {/* Line Items Table */}
                <div className="mb-12">
                    <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest border-b border-black print:border-zinc-300 pb-2 mb-4">Itemized Breakdown</h3>
                    
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-300">
                                <th className="py-3 px-2 font-bold text-xs uppercase tracking-widest text-zinc-500 w-1/2">Task / Item Description</th>
                                <th className="py-3 px-2 font-bold text-xs uppercase tracking-widest text-zinc-500 text-center">Qty / Hrs</th>
                                {printMode === 'customer' && (
                                    <>
                                        <th className="py-3 px-2 font-bold text-xs uppercase tracking-widest text-zinc-500 text-right">Rate</th>
                                        <th className="py-3 px-2 font-bold text-xs uppercase tracking-widest text-zinc-500 text-right pr-4">Amount</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="text-sm font-medium text-zinc-800 border-b-2 border-black print:border-zinc-300">
                            
                            {/* NEW TASKS ENGINE */}
                            {job.tasks?.filter((t: any) => t.isApproved !== false).map((t: any, idx: number) => {
                                const taskLaborExt = Number(t.bookTime || 0) * Number(t.laborRate || 0);
                                return (
                                    <React.Fragment key={`t-${idx}`}>
                                        {/* Task Labor Row */}
                                        <tr className="border-b border-zinc-100/70 print:break-inside-avoid">
                                            <td className="py-3 px-2 font-bold">
                                                {t.title || 'General Task Labor'} 
                                                <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest">Labor</span>
                                                {printMode === 'technician' && t.notes && (
                                                    <p className="text-xs text-zinc-500 font-normal mt-1 leading-relaxed bg-zinc-50 p-2 rounded border border-zinc-100">{t.notes}</p>
                                                )}
                                            </td>
                                            <td className="py-3 px-2 font-mono text-zinc-600 text-center">{t.bookTime || 0}</td>
                                            {printMode === 'customer' && (
                                                <>
                                                    <td className="py-3 px-2 font-mono text-zinc-600 text-right">${Number(t.laborRate || 0).toFixed(2)}</td>
                                                    <td className="py-3 px-2 font-mono font-bold text-right pr-4">${taskLaborExt.toFixed(2)}</td>
                                                </>
                                            )}
                                        </tr>
                                        {/* Task Parts */}
                                        {t.parts?.map((p: any, pIdx: number) => (
                                            <tr key={`tp-${idx}-${pIdx}`} className="border-b border-zinc-100/70 print:break-inside-avoid">
                                                <td className="py-2 px-2 pl-6 text-zinc-500 flex items-center mt-1 text-xs">
                                                    <span className="capitalize">{p.name || 'Unnamed Part'}</span>
                                                    <span className="text-[9px] border border-zinc-200 text-zinc-400 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest">Part</span>
                                                </td>
                                                <td className="py-2 px-2 font-mono text-zinc-500 text-center text-xs">{p.quantity}</td>
                                                {printMode === 'customer' && (
                                                    <>
                                                        <td className="py-2 px-2 font-mono text-zinc-500 text-right text-xs">${Number(p.price || 0).toFixed(2)}</td>
                                                        <td className="py-2 px-2 font-mono text-zinc-600 text-right pr-4 text-xs">${(Number(p.quantity || 1) * Number(p.price || 0)).toFixed(2)}</td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                )
                            })}

                            {/* LEGACY LOOP FAILSAFES */}
                            {job.laborLines?.map((l: any, idx: number) => (
                                <tr key={`ll-${idx}`} className="border-b border-zinc-100/70 print:break-inside-avoid">
                                    <td className="py-3 px-2 font-bold">{l.description || 'Legacy Labor'} <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest">Labor</span></td>
                                    <td className="py-3 px-2 font-mono text-zinc-600 text-center">{l.hours}</td>
                                    {printMode === 'customer' && (
                                        <>
                                            <td className="py-3 px-2 font-mono text-zinc-600 text-right">${Number(l.rate).toFixed(2)}</td>
                                            <td className="py-3 px-2 font-mono font-bold text-right pr-4">${(Number(l.hours) * Number(l.rate)).toFixed(2)}</td>
                                        </>
                                    )}
                                </tr>
                            ))}

                            {job.parts?.map((p: any, pIdx: number) => (
                                <tr key={`lp-${pIdx}`} className="border-b border-zinc-100/70 print:break-inside-avoid">
                                    <td className="py-2 px-2 text-zinc-500 text-xs flex items-center mt-1">
                                        <span className="capitalize">{p.name || 'Legacy Part'}</span>
                                        <span className="text-[9px] border border-zinc-200 text-zinc-400 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest">Part</span>
                                    </td>
                                    <td className="py-2 px-2 font-mono text-zinc-500 text-center text-xs">{p.quantity}</td>
                                    {printMode === 'customer' && (
                                        <>
                                            <td className="py-2 px-2 font-mono text-zinc-500 text-right text-xs">${Number(p.price).toFixed(2)}</td>
                                            <td className="py-2 px-2 font-mono text-zinc-600 text-right pr-4 text-xs">${(Number(p.quantity) * Number(p.price)).toFixed(2)}</td>
                                        </>
                                    )}
                                </tr>
                            ))}

                            {/* Fallback Empty */}
                            {(!job.tasks?.length && !job.laborLines?.length && !job.parts?.length) && (
                                <tr>
                                    <td colSpan={printMode === 'customer' ? 4 : 2} className="py-8 text-center text-zinc-400 italic">No line items specified in scope.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Totals Section */}
                {printMode === 'customer' && (
                    <div className="flex justify-end mb-16 print:break-inside-avoid">
                        <div className="w-1/2 min-w-[300px]">
                            <div className="flex justify-between py-2 border-b border-zinc-100">
                                <span className="font-bold text-zinc-500 uppercase text-xs tracking-widest">Subtotal (Parts)</span>
                                <span className="font-mono text-zinc-800 font-bold">${partsTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-zinc-100">
                                <span className="font-bold text-zinc-500 uppercase text-xs tracking-widest">Subtotal (Labor)</span>
                                <span className="font-mono text-zinc-800 font-bold">${laborTotal.toFixed(2)}</span>
                            </div>
                            
                            {(Number(job.sopSupplies) || 0) > 0 && (
                                <div className="flex justify-between py-2 border-b border-zinc-100">
                                    <span className="font-bold text-zinc-500 uppercase text-xs tracking-widest">Shop Supplies</span>
                                    <span className="font-mono text-zinc-800 font-bold">${Number(job.sopSupplies).toFixed(2)}</span>
                                </div>
                            )}
                            
                            {(Number(job.shipping) || 0) > 0 && (
                                <div className="flex justify-between py-2 border-b border-zinc-100">
                                    <span className="font-bold text-zinc-500 uppercase text-xs tracking-widest">Shipping & Freight</span>
                                    <span className="font-mono text-zinc-800 font-bold">${Number(job.shipping).toFixed(2)}</span>
                                </div>
                            )}

                            {discountAmount > 0 && (
                                <div className="flex justify-between py-2 border-b border-zinc-100">
                                    <span className="font-bold text-rose-500 uppercase text-xs tracking-widest">Discount ({job.discount || 0}%)</span>
                                    <span className="font-mono text-rose-600 font-bold">-${discountAmount.toFixed(2)}</span>
                                </div>
                            )}

                            <div className="flex justify-between py-2 border-b border-zinc-100">
                                <span className="font-bold text-zinc-500 uppercase text-xs tracking-widest">Est. Taxes ({taxRateStr}%)</span>
                                <span className="font-mono text-zinc-800 font-bold">${taxes.toFixed(2)}</span>
                            </div>

                            <div className="flex justify-between py-4 border-b-4 border-black print:border-zinc-400 mt-2">
                                <span className="text-xl font-black uppercase">Grand Total</span>
                                <span className="font-mono text-2xl font-black">${grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Authorization Block */}
                <div className="mt-24 pt-8 border-t border-zinc-200 print:break-inside-avoid">
                    <h3 className="font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-zinc-400"/> General Authorization</h3>
                    <p className="text-zinc-500 text-xs text-balance mb-12 max-w-2xl">
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
            
        </div>,
        document.body
    );
}
