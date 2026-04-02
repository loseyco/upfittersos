import { QrCode, Server, Factory } from 'lucide-react';

export const QrProtocolDoc = () => {
    return (
        <div className="animate-in fade-in max-w-3xl prose-invert pb-20">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">Hardware Architecture</h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
                This document establishes the architectural logic for deploying physical QR stickers across multi-tenant UpfitterOS environments. It is the definitive source of truth for handling physical hardware within a mutable software lifecycle.
            </p>

            <div className="space-y-12">
                
                {/* Section 1 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                            <Server className="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">1. The Immutable Domain Protocol</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Physical stickers cannot be easily updated once distributed. Therefore, the URLs printed on those stickers must be universally stable and brand-agnostic.
                        </p>
                        <div className="bg-black/50 border border-zinc-800 rounded-lg p-4 mb-4">
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 block">The Golden Standard Target</span>
                            <code className="text-emerald-400 font-mono font-bold break-all">https://upfitteros.com/qr/[id]</code>
                        </div>
                        <p className="text-zinc-400 text-sm leading-relaxed">
                            By exclusively pointing all physical tags to the absolute root domain of the software (`upfitteros.com`), the physical infrastructure is entirely decoupled from downstream tenant routing. The central API intercepts the scan, isolates the `tenantId` (e.g., SAE Group), and gracefully executes a `301 Redirect` to bounce the mobile device to the tenant's current active sub-domain or custom white-labeled domain.
                        </p>
                    </div>
                </section>

                {/* Section 2 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-500/20 rounded-lg border border-amber-500/30">
                            <Factory className="w-5 h-5 text-amber-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">2. Tag Generation & "Dumb" Tags</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Because the QR engine relies on unassigned <code className="bg-black text-amber-400 px-2 py-0.5 rounded text-sm">qr_nodes</code>, the generator simply produces thousands of random, unassigned cryptographic strings. They do exactly zero harm if a printer jams or a roll is lost. 
                        </p>
                        <p className="text-zinc-300 leading-relaxed mb-6 font-medium text-white/90">
                            A tag explicitly does nothing until authorized staff (or an AI delegate) initiates an active scan to bind it to a chassis or part.
                        </p>
                        
                        <h3 className="text-white font-bold mb-3">Supported Output Mechanisms:</h3>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                                <div>
                                    <strong className="text-white">Manufacturer CSV:</strong> <span className="text-zinc-400">For enterprise fleets ordering 10,000 holographic, tamper-proof security tags on a roll. The backend zips a CSV of the raw URLs.</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                                <div>
                                    <strong className="text-white">Avery PDF Sheet:</strong> <span className="text-zinc-400">For rapid deployment. The system tiles the URLs into an 8.5x11 PDF perfectly aligned for standard office sticker paper.</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                                <div>
                                    <strong className="text-white">Single Thermal Action:</strong> <span className="text-zinc-400">A native integration feeding 2x1 raw ZPL commands to Zebra/Brother USB thermal machines that immediately spits out a single tag formatted for a new intake box.</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Section 3 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-500/20 rounded-lg border border-purple-500/30">
                            <QrCode className="w-5 h-5 text-purple-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">3. Fault Tolerance Workflows</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 space-y-6">
                        <div>
                            <h3 className="text-white font-bold mb-2">Handling Printer Jams (Bulk Level)</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">
                                Tag issuance actions are recorded as explicit <code>BatchEvents</code> in the database. If a physical printing process catastrophically fails (e.g. 50 pages of stickers get jammed), the manager simply navigates to the Batch Logs, isolates the specific batch, and executes a fresh download. No complex tracking is required since unassigned tags inherently carry no state.
                            </p>
                        </div>
                        <div className="h-px w-full bg-zinc-800"></div>
                        <div>
                            <h3 className="text-white font-bold mb-2">Handling Damaged Stickers (Granular Level)</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">
                                If a physical tag assigned to an active Customer Vehicle is destroyed in the shop, the front office does not generate a new tag. They simply pull up that vehicle's Unit Dashboard, click <strong>Reprint Tag</strong>, and send a replica of the identical `[id]` back to the thermal printer, perfectly preserving the existing digital lineage without database mutation.
                            </p>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
};
