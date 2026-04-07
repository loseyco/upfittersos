import { Terminal, QrCode, Shield, ArrowLeftRight, Users, MessageSquare, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '../../lib/constants';

export const DocsOverview = () => {
    return (
        <div className="animate-in fade-in max-w-5xl">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">{APP_NAME} Documentation</h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12 max-w-3xl">
                Welcome to the definitive source of truth for the {APP_NAME} ecosystem. This hub contains both public-facing API references, staff manuals, and internal operational protocols.
            </p>

            {/* Getting Started & Staff */}
            <h2 className="text-xl font-bold text-white mb-6 border-b border-zinc-800 pb-2">Guides & Operations</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <Link to="/documents/staff" className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <Users className="w-6 h-6 text-orange-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Staff Manual</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Comprehensive workflows for the dynamic Technician Portal, Real-Time Meeting Workspace, and Facility Map navigation.
                    </p>
                </Link>

                <Link to="/documents/feedback" className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <MessageSquare className="w-6 h-6 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Feedback & Issues</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Guidelines for submitting actionable bug reports and feature requests, including unauthenticated pre-login submissions.
                    </p>
                </Link>

                <Link to="/documents/changelog" className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <History className="w-6 h-6 text-sky-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Release Notes</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Historical changelogs detailing platform updates, bug fixes, and systemic telemetry adjustments.
                    </p>
                </Link>
            </div>

            {/* Developers & Protocol */}
            <h2 className="text-xl font-bold text-white mb-6 border-b border-zinc-800 pb-2">Technical Reference</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <Link to="/documents/api" className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <Terminal className="w-6 h-6 text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">REST API Reference</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Interactive OpenAPI specifications for the active Google Cloud Functions routing backend.
                    </p>
                </Link>

                <Link to="/documents/integrations" className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center border border-pink-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <ArrowLeftRight className="w-6 h-6 text-pink-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Ecosystem Integrations</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Protocol definitions for QuickBooks Online syncing and isolated per-user CompanyCam authentications.
                    </p>
                </Link>

                <Link to="/documents/hardware" className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <QrCode className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">QR Hardware Strategy</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        The physical master blueprint governing multi-tenant vanity domains, bulk tag generation, and fault tolerance.
                    </p>
                </Link>

                <Link to="/documents/roles" className="group bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <Shield className="w-6 h-6 text-red-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Security & Roles</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Details on `system_owner` hierarchical advantages, multi-tenant boundaries, and dynamic feature gating parameters.
                    </p>
                </Link>
            </div>
        </div>
    );
};
