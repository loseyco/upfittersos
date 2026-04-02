import { ScanLine, FlaskConical } from 'lucide-react';

export function InventoryAdminTab(_props: { tenantId: string }) {
    return (
        <div className="flex flex-col h-full bg-zinc-950 relative items-center justify-center p-6 text-center">
            <div className="relative mb-8">
                <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full"></div>
                <div className="w-24 h-24 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center relative shadow-2xl relative z-10">
                    <ScanLine className="w-10 h-10 text-emerald-400" />
                </div>
                <div className="absolute -top-3 -right-3 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md shadow-lg z-20 border border-orange-400 rotate-12">
                    #Soon
                </div>
            </div>
            
            <h2 className="text-3xl font-black text-white tracking-tight mb-3">Warehouse Management System</h2>
            <p className="text-zinc-400 max-w-md text-sm leading-relaxed mb-8">
                Real-time stock auditing, advanced QR tag generation, and hardware provisioning directly from the supplier supply-chain matrix.
            </p>

            <div className="bg-orange-500/5 border border-orange-500/20 px-6 py-4 rounded-xl flex items-start gap-4 max-w-md text-left shadow-lg">
                <FlaskConical className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-orange-400 font-bold text-sm mb-1">Alpha Roadmap</h3>
                    <p className="text-orange-400/80 text-xs leading-relaxed">
                        The physical barcode scanning systems are currently undergoing hardware validation. Digital inventory interfaces will be exposed shortly.
                    </p>
                </div>
            </div>
        </div>
    );
}
