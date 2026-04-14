import { Target, Users, Bell, ArrowRight, LayoutDashboard, Database } from 'lucide-react';

export function FeatureCheatsheetTab() {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2 mb-2 text-white">
                    <Target className="w-6 h-6 text-accent" /> Recent Feature Cheatsheet
                </h2>
                <p className="text-zinc-400 font-medium">A quick rundown of the major systems and enhancements deployed recently. Use this for quick reference in meetings.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mission Control & TV Kiosk */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all group hover:shadow-2xl hover:shadow-blue-500/5">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-inner group-hover:scale-105 transition-transform">
                            <LayoutDashboard className="w-6 h-6 text-blue-400" />
                        </div>
                        <h3 className="text-xl font-black text-white tracking-tight">Mission Control & TV Kiosk</h3>
                    </div>
                    <ul className="space-y-4">
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-zinc-100 block mb-1 text-base">TV View Dashboard</span>
                                <span className="text-zinc-400 leading-relaxed block">Full-bleed dashboard for static shop floor displays, surfacing real-time telemetry, shift rosters, and facility maps without admin clutter.</span>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-red-400 block mb-1 text-base">Global "Police Lights" Alert System</span>
                                <span className="text-zinc-400 leading-relaxed block">A full-screen visual override that pushes critical, company-wide announcements instantly to all connected clients.</span>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-zinc-100 block mb-1 text-base">Seamless Route Provisioning</span>
                                <span className="text-zinc-400 leading-relaxed block">Optimized routing rules to ensure the primary entry point is the dashboard with strict unauthenticated redirection.</span>
                            </div>
                        </li>
                    </ul>
                </div>

                {/* Job Execution & Time Tracking */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all group hover:shadow-2xl hover:shadow-emerald-500/5">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner group-hover:scale-105 transition-transform">
                            <Users className="w-6 h-6 text-emerald-400" />
                        </div>
                        <h3 className="text-xl font-black text-white tracking-tight">Job Execution & Labor Tracking</h3>
                    </div>
                    <ul className="space-y-4">
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-emerald-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-zinc-100 block mb-1 text-base">Entity Assignment Locks</span>
                                <span className="text-zinc-400 leading-relaxed block">Technicians remain bound to tasks until explicitly marked as finished, successfully preventing accidental removal of staff who have logged labor against a task.</span>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-emerald-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-zinc-100 block mb-1 text-base">Smart Time Allocation Foundation</span>
                                <span className="text-zinc-400 leading-relaxed block">Advanced architectural logic supporting complex tracking patterns, specifically resolving inflated metrics when technicians operate on multiple tasks simultaneously.</span>
                            </div>
                        </li>
                    </ul>
                </div>

                {/* Automated Operations & Reminders */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all group hover:shadow-2xl hover:shadow-purple-500/5">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shadow-inner group-hover:scale-105 transition-transform">
                            <Bell className="w-6 h-6 text-purple-400" />
                        </div>
                        <h3 className="text-xl font-black text-white tracking-tight">Automated Operations & Alerts</h3>
                    </div>
                    <ul className="space-y-4">
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-purple-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-zinc-100 block mb-1 text-base">Advanced Custom Scheduling</span>
                                <span className="text-zinc-400 leading-relaxed block">Deployed granular notification capabilities enabling users to schedule reminders by day-of-week or specific days-of-month.</span>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-purple-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-zinc-100 block mb-1 text-base">Reliable Background Daemon</span>
                                <span className="text-zinc-400 leading-relaxed block">Built and integrated the continuous-loop background tracker that monitors time definitions and successfully triggers alerts synchronously.</span>
                            </div>
                        </li>
                    </ul>
                </div>

                {/* Multi-Tenant SaaS Infrastructure */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all group hover:shadow-2xl hover:shadow-orange-500/5">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shadow-inner group-hover:scale-105 transition-transform">
                            <Database className="w-6 h-6 text-orange-400" />
                        </div>
                        <h3 className="text-xl font-black text-white tracking-tight">Global Network Infrastructure</h3>
                    </div>
                    <ul className="space-y-4">
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-orange-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-zinc-100 block mb-1 text-base">Data Boundary Enforcement</span>
                                <span className="text-zinc-400 leading-relaxed block">Standardized firestore rules mapping identity claims across full hierarchical data boundaries to enforce isolation.</span>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="w-4 h-4 text-orange-500 mt-1 flex-shrink-0 transform group-hover:translate-x-1 transition-transform" />
                            <div className="text-sm">
                                <span className="font-bold text-zinc-100 block mb-1 text-base">Automated Repository Backup State</span>
                                <span className="text-zinc-400 leading-relaxed block">Implemented system-level script synchronization for Git remote offsite backups to secure codebase iterations.</span>
                            </div>
                        </li>
                    </ul>
                </div>

            </div>
        </div>
    );
}
