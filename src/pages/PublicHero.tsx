import { Shield, Wrench, Layers, Truck, MapPin, Phone, Mail, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export function PublicHero() {
    const { currentUser, loading } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && currentUser) {
            currentUser.getIdTokenResult(true).then(res => {
                if (res.claims.role === 'super_admin') {
                    navigate('/admin', { replace: true });
                } else {
                    navigate('/workspace', { replace: true });
                }
            }).catch(() => navigate('/workspace', { replace: true }));
        }
    }, [currentUser, loading, navigate]);

    if (loading || currentUser) {
        return (
            <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center min-h-screen">
                <span className="relative flex h-8 w-8 mb-6">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-8 w-8 bg-accent"></span>
                </span>
                <p className="text-zinc-500 font-bold uppercase tracking-widest animate-pulse ml-2 text-sm">Identifying Authorization Vector...</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-950 text-white min-h-screen">
            {/* HEROS SECTION */}
            <div className="relative overflow-hidden isolate pt-24 pb-20 sm:pt-32 border-b border-zinc-900">
                {/* Background glow effects */}
                <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
                    <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#3b82f6] to-[#0ea5e9] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"></div>
                </div>

                <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="hidden sm:mb-8 sm:flex sm:justify-center">
                            <div className="relative rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest leading-6 text-accent ring-1 ring-accent/30 hover:ring-accent/50 transition-all backdrop-blur-sm bg-accent/5">
                                PLATFORM V2.0 LIVE
                            </div>
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-white flex flex-col items-center sm:text-7xl mb-6">
                            The Operating System for <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-[#0ea5e9] mt-2">Vehicle Upfitters</span>
                        </h1>
                        <p className="mt-6 text-lg xl:text-xl leading-8 text-zinc-300 font-medium max-w-2xl mx-auto">
                            Streamline your entire operation. Manage jobs, track fleet inventory, and dispatch technicians from one centralized, cloud-based command center.
                        </p>
                    </div>
                </div>
            </div>

            {/* MISSION STATEMENT */}
            <div className="py-24 sm:py-32 bg-zinc-900/30 border-b border-zinc-900">
                <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
                    <Shield className="w-12 h-12 text-accent mx-auto mb-8 opacity-80" />
                    <h2 className="text-base font-bold tracking-widest text-zinc-500 uppercase mb-6">Built For Scale</h2>
                    <p className="text-xl md:text-3xl font-medium leading-relaxed text-zinc-200 tracking-tight">
                        "Stop running your multi-bay garage on spreadsheets and whiteboards. Our platform is purpose-built to handle complex workflows, from electrical harness assembly to full pursuit-ready fleet deployments."
                    </p>
                </div>
            </div>

            {/* FEATURES GRID */}
            <div className="py-24 sm:py-32">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="mx-auto max-w-2xl lg:text-center mb-16">
                        <h2 className="text-base font-bold tracking-widest text-accent uppercase">Platform Capabilities</h2>
                        <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Everything you need to grow.</p>
                    </div>
                    <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
                        <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">

                            <div className="flex flex-col bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-600 transition-colors cursor-default">
                                <dt className="flex items-center gap-x-3 text-lg font-bold leading-7 text-white mb-4">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-accent/20 border border-accent/20">
                                        <Layers className="h-5 w-5 text-accent" aria-hidden="true" />
                                    </div>
                                    Work Order Management
                                </dt>
                                <dd className="mt-1 flex flex-auto flex-col text-sm leading-6 text-zinc-400">
                                    <p className="flex-auto">Track jobs from quote to delivery. Assign technicians, log parts used, and monitor bay utilization in real-time.</p>
                                </dd>
                            </div>

                            <div className="flex flex-col bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-600 transition-colors cursor-default">
                                <dt className="flex items-center gap-x-3 text-lg font-bold leading-7 text-white mb-4">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-pink-500/10 border border-pink-500/20">
                                        <Wrench className="h-5 w-5 text-pink-500" aria-hidden="true" />
                                    </div>
                                    Inventory & Assets
                                </dt>
                                <dd className="mt-1 flex flex-auto flex-col text-sm leading-6 text-zinc-400">
                                    <p className="flex-auto">Monitor stock levels for lightbars, sirens, and custom harnesses. Track valuable tools seamlessly.</p>
                                </dd>
                            </div>

                            <div className="flex flex-col bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-600 transition-colors cursor-default">
                                <dt className="flex items-center gap-x-3 text-lg font-bold leading-7 text-white mb-4">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        <Truck className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                                    </div>
                                    Fleet Logistics
                                </dt>
                                <dd className="mt-1 flex flex-auto flex-col text-sm leading-6 text-zinc-400">
                                    <p className="flex-auto">Coordinate vehicle intake, manage vendor drop-offs, and track customer delivery schedules without missing a beat.</p>
                                </dd>
                            </div>

                        </dl>
                    </div>
                </div>
            </div>

            {/* FOOTER */}
            <footer className="bg-zinc-950 border-t border-zinc-900 py-12">
                <div className="mx-auto max-w-7xl px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">

                    <div>
                        <h3 className="text-white font-black text-xl mb-4 tracking-tight">UPFITTER OS</h3>
                        <p className="text-sm text-zinc-400">Powered by SAE Group</p>
                    </div>

                    <div>
                        <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-accent" /> Platform HQ</h4>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            4012 Main Street<br />
                            McHenry, IL 60050
                        </p>
                    </div>

                    <div>
                        <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4 flex items-center gap-2"><Phone className="w-4 h-4 text-accent" /> Support</h4>
                        <ul className="space-y-3 text-sm text-zinc-400">
                            <li><a href="tel:1-847-999-7999" className="hover:text-white transition-colors">1-847-999-7999</a></li>
                            <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> <a href="mailto:support@saegrp.com" className="hover:text-white transition-colors">support@saegrp.com</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> System Status</h4>
                        <p className="text-sm text-emerald-400 font-medium leading-relaxed flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            All Systems Operational
                        </p>
                    </div>

                </div>
                <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-12 pt-8 border-t border-zinc-900 flex flex-col md:flex-row justify-between items-center">
                    <p className="text-xs text-zinc-600">&copy; 2026 Upfitter OS. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
