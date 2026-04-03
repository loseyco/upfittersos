import { Workflow, Database, CloudFog } from 'lucide-react';

export const IntegrationsDoc = () => {
    return (
        <div className="animate-in fade-in max-w-3xl prose-invert pb-20">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">Ecosystem Integrations</h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
                UpfitterOS isn't designed to be a silo; it is engineered as the central nervous system connecting your shop. We use an event-driven webhook architecture to seamlessly synchronize data with industry-leading third-party platforms.
            </p>

            <div className="space-y-12">
                {/* Intro Section */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-pink-500/20 rounded-lg border border-pink-500/30">
                            <Workflow className="w-5 h-5 text-pink-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Event-Driven Architecture</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed text-sm mb-4">
                            Instead of relying on slow, outdated nightly batch jobs to sync data, UpfitterOS listens to live webhooks. When an action occurs on external platforms, our microservices instantly ingest and translate the data into our universal Firestore database format. 
                        </p>
                        <p className="text-zinc-400 leading-relaxed text-sm mb-4">
                            Likewise, when an authorized user mutates a record inside UpfitterOS, we automatically broadcast that event outward to authorized external endpoints.
                        </p>
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3 mt-6">
                            <Workflow className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-white font-bold text-sm mb-1">Seamless connection via OAuth 2.0</h4>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    Connections to supported platforms require strict, tokenized authorization. Administrators can securely link their tenant accounts to these external systems by navigating to <b>Business Suite &rarr; Settings &rarr; Integrations</b> and authenticating via the standard OAuth 2.0 protocol.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Core Partners */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-sky-500/20 rounded-lg border border-sky-500/30">
                            <CloudFog className="w-5 h-5 text-sky-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Supported Platforms</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        <div className="bg-black/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                            <h3 className="text-white font-bold text-md mb-2 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Intuit QuickBooks
                            </h3>
                            <p className="text-zinc-400 text-xs leading-relaxed mb-4">
                                Deep bidirectional sync with QuickBooks Online (QBO). Generates unified ledgers without manual double-entry, with a specialized engine for physical inventory counts.
                            </p>
                            <ul className="text-[11px] font-mono text-zinc-500 space-y-1">
                                <li>→ Push: Live Inventory Quantity Adjustments</li>
                                <li>→ Push: Catalog & Parts Synchronization</li>
                                <li>→ Push: Customer Invoices & Billing</li>
                            </ul>
                        </div>

                        <div className="bg-black/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                            <h3 className="text-white font-bold text-md mb-2 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div> CompanyCam
                            </h3>
                            <p className="text-zinc-400 text-xs leading-relaxed mb-4">
                                Autonomous synchronization of physical shop floor photography into specific UpfitterOS build profiles.
                            </p>
                            <ul className="text-[11px] font-mono text-zinc-500 space-y-1">
                                <li>→ Push: Project Creation (VIN/Build)</li>
                                <li>← Pull: High-Res Project Photos</li>
                                <li>← Pull: Tagged Defects/QC Issues</li>
                            </ul>
                        </div>
                        
                        <div className="bg-black/50 border border-zinc-800 rounded-xl p-5 md:col-span-2 hover:border-zinc-700 transition-colors">
                            <h3 className="text-white font-bold text-md mb-2 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse"></div> Future Supported APIs
                            </h3>
                            <p className="text-zinc-400 text-xs leading-relaxed">
                                Because our webhook ingestion pipeline is modular, UpfitterOS is actively expanding to include modern Fleet GPS telemetry algorithms (Geotab/Samsara), parts wholesale providers (NAPA/O'Reilly PRO), and native e-commerce gateways (Stripe Payments).
                            </p>
                        </div>

                    </div>
                </section>

                {/* Custom API Integrations */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-500/20 rounded-lg border border-amber-500/30">
                            <Database className="w-5 h-5 text-amber-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Custom Tenant Connections</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                        <p className="text-zinc-300 leading-relaxed text-sm">
                            Enterprise plans feature the capability to issue dedicated API Service Accounts. This allows vast external SaaS products your company explicitly uses to directly fetch (or ingest) data endpoints from your private UpfitterOS `tenantId` without manual human intervention.
                        </p>
                    </div>
                </section>
                
            </div>
        </div>
    );
};
