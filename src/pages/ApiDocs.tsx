import { Key, Server, Terminal, Shield, Lock, Activity, Link as LinkIcon } from 'lucide-react';

export function ApiDocs() {
    return (
        <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-12">
                
                {/* Header */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                            <Server className="w-6 h-6 text-accent" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">SAE OS Direct API</h1>
                    </div>
                    <p className="text-zinc-400 text-lg max-w-2xl leading-relaxed">
                        The Multi-Tenant Core API powering the SAE Group ecosystem. Explore the endpoints required to securely integrate operations, provision clients, and synchronize external platform architecture.
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mt-6">
                        <span className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-sm font-bold">
                            <Activity className="w-4 h-4" /> System Online
                        </span>
                        <span className="inline-flex items-center gap-2 bg-zinc-900 text-zinc-400 border border-zinc-800 px-3 py-1.5 rounded-lg text-sm font-mono tracking-tighter">
                            V1.0.0
                        </span>
                    </div>
                </div>

                {/* Authentication Concept */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 md:p-8 space-y-6">
                    <h2 className="text-2xl font-bold flex items-center gap-3 border-b border-zinc-800 pb-4">
                        <Shield className="w-6 h-6 text-purple-400" /> Security & Authentication
                    </h2>
                    <p className="text-zinc-400 leading-relaxed">
                        All requests to the SAE API must be authenticated using Firebase ID Tokens. The backend automatically cryptographically verifies the <code className="text-purple-400 font-bold bg-purple-400/10 px-1.5 rounded">Authorization: Bearer &lt;Token&gt;</code> header to extract the user's highly granular Custom Claims (e.g., <code className="text-zinc-300 bg-zinc-800 px-1 rounded">role: 'business_owner'</code>, <code className="text-zinc-300 bg-zinc-800 px-1 rounded">tenantId: 'XYZ'</code>).
                    </p>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-sm text-zinc-300 mt-4 overflow-x-auto">
                        <span className="text-zinc-500">// Example Axios Setup</span><br/>
                        <span className="text-blue-400">api</span>.<span className="text-emerald-400">interceptors</span>.<span className="text-emerald-400">request</span>.<span className="text-yellow-400">use</span>(<span className="text-purple-400">async</span> (config) {'=>'} {'{'}<br/>
                        &nbsp;&nbsp;<span className="text-purple-400">const</span> token = <span className="text-purple-400">await</span> auth.currentUser?.<span className="text-yellow-400">getIdToken</span>();<br/>
                        &nbsp;&nbsp;<span className="text-purple-400">if</span> (token) config.headers.<span className="text-zinc-100">Authorization</span> = <span className="text-emerald-300">`Bearer {'${token}'}`</span>;<br/>
                        &nbsp;&nbsp;<span className="text-purple-400">return</span> config;<br/>
                        {'}'});
                    </div>
                </div>

                {/* Endpoint Definitions */}
                <div className="space-y-8">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        <Terminal className="w-6 h-6 text-blue-400" /> Endpoints
                    </h2>
                    
                    {/* GET /users */}
                    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/30 transition-colors">
                        <div className="bg-zinc-900 p-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <span className="bg-blue-500 text-white text-xs font-black uppercase tracking-wider px-2 py-1 rounded">GET</span>
                                <code className="text-lg font-mono text-white font-bold tracking-tight">/users</code>
                            </div>
                            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 uppercase tracking-widest bg-red-500/10 px-2.5 py-1 rounded border border-red-500/20">
                                <Lock className="w-3 h-3" /> Super Admin Only
                            </span>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-zinc-400">Performs a localized sync against the Google Admin SDK to retrieve the unified global directory of all platform identities. It securely exposes Custom Claims (Role, TenantID) to the Super Admin interface.</p>
                            <div className="bg-zinc-950 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-zinc-800 text-zinc-300">
                                <span className="text-zinc-500">// Response Mapping</span><br/>
                                [<br/>
                                &nbsp;&nbsp;{'{'}<br/>
                                &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-400">"uid"</span>: <span className="text-amber-300">"firebase_auth_uid"</span>,<br/>
                                &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-400">"email"</span>: <span className="text-amber-300">"user@domain.com"</span>,<br/>
                                &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-400">"role"</span>: <span className="text-amber-300">"super_admin | business_owner | staff"</span>,<br/>
                                &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-400">"tenantId"</span>: <span className="text-amber-300">"business_document_id"</span><br/>
                                &nbsp;&nbsp;{'}'}<br/>
                                ]
                            </div>
                        </div>
                    </div>

                    {/* POST /businesses */}
                    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-colors">
                        <div className="bg-zinc-900 p-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <span className="bg-emerald-500 text-white text-xs font-black uppercase tracking-wider px-2 py-1 rounded">POST</span>
                                <code className="text-lg font-mono text-white font-bold tracking-tight">/businesses</code>
                            </div>
                            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 uppercase tracking-widest bg-red-500/10 px-2.5 py-1 rounded border border-red-500/20">
                                <Lock className="w-3 h-3" /> Super Admin Only
                            </span>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-zinc-400">Architects a new Multi-Tenant workspace and assigns an Owner identity. If the requested owner already exists in the auth schema, it maps the required tenant claims to their existing profile natively. If not, it provisions them.</p>
                            <div className="bg-zinc-950 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-zinc-800 text-zinc-300">
                                <span className="text-zinc-500">// Request Body</span><br/>
                                {'{'}<br/>
                                &nbsp;&nbsp;<span className="text-emerald-400">"name"</span>: <span className="text-amber-300">"Client Organization Name"</span>,<br/>
                                &nbsp;&nbsp;<span className="text-emerald-400">"ownerEmail"</span>: <span className="text-amber-300">"admin@client.com"</span>,<br/>
                                &nbsp;&nbsp;<span className="text-emerald-400">"subscriptionPlan"</span>: <span className="text-amber-300">"free"</span><br/>
                                {'}'}
                            </div>
                        </div>
                    </div>

                    {/* POST /roles/assign */}
                    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-colors">
                        <div className="bg-zinc-900 p-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <span className="bg-emerald-500 text-white text-xs font-black uppercase tracking-wider px-2 py-1 rounded">POST</span>
                                <code className="text-lg font-mono text-white font-bold tracking-tight">/roles/assign</code>
                            </div>
                            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-widest bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
                                <Key className="w-3 h-3" /> Delegated Access
                            </span>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-zinc-400">The core delegation routing system. Super Admins can assign roles system-wide. Business Owners are strictly gated to assigning roles within their own operational <code className="text-zinc-300 bg-zinc-800 rounded px-1">tenantId</code>.</p>
                            <div className="bg-zinc-950 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-zinc-800 text-zinc-300">
                                <span className="text-zinc-500">// Request Body</span><br/>
                                {'{'}<br/>
                                &nbsp;&nbsp;<span className="text-emerald-400">"targetUid"</span>: <span className="text-amber-300">"Target Auth User ID"</span>,<br/>
                                &nbsp;&nbsp;<span className="text-emerald-400">"role"</span>: <span className="text-amber-300">"department_lead | parts_guy | staff"</span>,<br/>
                                &nbsp;&nbsp;<span className="text-emerald-400">"tenantId"</span>: <span className="text-amber-300">"Required for mapping"</span><br/>
                                {'}'}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-zinc-800 pt-8 flex items-center justify-between">
                    <p className="text-zinc-500 text-sm font-medium">SAE Group Platform OS Internal Documentation</p>
                    <a href="mailto:sysadmin@saegrp.com" className="text-sm font-bold text-accent hover:text-white transition-colors flex items-center gap-2">
                        Request API Key <LinkIcon className="w-4 h-4" />
                    </a>
                </div>

            </div>
        </div>
    );
}
