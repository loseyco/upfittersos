import { Shield, Key, Lock, Network } from 'lucide-react';

export const RolesDoc = () => {
    return (
        <div className="animate-in fade-in max-w-3xl prose-invert pb-20">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">Security & Architecture</h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
                UpfitterOS was architected from the ground up as a zero-trust, enterprise-grade multi-tenant platform. This document outlines the high-level security paradigms protecting our environment without disclosing proprietary internal operational logic.
            </p>

            <div className="space-y-12">
                
                {/* Section 1 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
                            <Lock className="w-5 h-5 text-emerald-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Cryptographic Multi-Tenancy</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed text-sm mb-4">
                            Unlike legacy software that relies on simple database filters to separate clients, UpfitterOS enforces strict cryptographic isolation at the identity layer.
                        </p>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <Key className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                                <span className="text-zinc-300 text-sm leading-relaxed">
                                    <strong className="text-white block">Immutable JWT Tokens</strong>
                                    Upon authentication, Google Identity Platform issues a cryptographically signed JSON Web Token (JWT) that explicitly binds the user to a precise `tenantId` (Workspace). This token cannot be forged or altered by the client.
                                </span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Network className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                                <span className="text-zinc-300 text-sm leading-relaxed">
                                    <strong className="text-white block">Zero-Trust Node Routing</strong>
                                    Every single direct API request flowing into our cloud infrastructure is intercepted by a custom `authenticate` middleware. It aggressively cross-references the user's cryptographically stamped `tenantId` against the requested asset. If a user attempts to fetch a Work Order or scan a QR code owned by a different company, the API severs the connection and returns a strict `403 Forbidden` firewall rejection without executing the query.
                                </span>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Section 2 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                            <Shield className="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Role-Based Access Control (RBAC)</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed text-sm mb-6">
                            Even within an isolated Workspace, access to operational capacity is strictly minimized down to a granular Identity Role matrix.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-black/50 border border-zinc-800 rounded-xl p-4">
                                <h3 className="text-white font-bold text-sm mb-2">1. The Public Node</h3>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    Unauthenticated traffic or clients who lack authorization interact strictly with public-facing web components. No operational data is surfaced.
                                </p>
                            </div>
                            <div className="bg-black/50 border border-zinc-800 rounded-xl p-4">
                                <h3 className="text-white font-bold text-sm mb-2">2. Staff Layer</h3>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    The standard operating role for mechanics and administrative personnel. Grants read/write access to Work Orders, Inventory intake, and QR allocations strictly within their assigned `tenantId`.
                                </p>
                            </div>
                            <div className="bg-black/50 border border-zinc-800 rounded-xl p-4">
                                <h3 className="text-white font-bold text-sm mb-2">3. Management Override</h3>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    A leadership tier allowing elevated oversight, including the capability to force-override hardware tags, adjust financial ledgers, and provision access to new facility staff.
                                </p>
                            </div>
                            <div className="bg-indigo-500/5 mx-auto w-full md:border-indigo-500/10 border border-zinc-800 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Shield className="w-4 h-4 text-indigo-400" />
                                    <h3 className="text-indigo-400 font-black text-[10px] tracking-widest uppercase">Global Authority (Super Admin & System Owner)</h3>
                                </div>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    Reserved exclusively for platform architects. Both `super_admin` and `system_owner` roles completely bypass localized multi-tenancy rules to manage the root infrastructure, API integrations, global business impersonation, and raw database clusters.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 3 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-orange-500/20 rounded-lg border border-orange-500/30">
                            <Lock className="w-5 h-5 text-orange-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Tiered Feature Gating</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed text-sm mb-4">
                            Not all business tenants operate the full UpfitterOS suite. Access to backend administrative modules is dynamically controlled via the Master Registry.
                        </p>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <Network className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                                <span className="text-zinc-300 text-sm leading-relaxed">
                                    <strong className="text-white block">Feature Flags</strong>
                                    Modules such as CRM, Fleet Control, Areas, Inventory, Operations Management, Finances, and Reports are strictly gated. These features can only be enabled or disabled by Global Authority personnel in the Super Admin dashboard. If a tenant is not provisioned for a module, the routing engine securely denies access to both the UI and the underlying API endpoints.
                                </span>
                            </li>
                        </ul>
                    </div>
                </section>

            </div>
        </div>
    );
};
