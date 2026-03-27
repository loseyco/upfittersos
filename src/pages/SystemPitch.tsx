import { LayoutDashboard, Workflow, Building2, Zap, ShieldCheck, CheckCircle2, UserPlus, FileSignature, Presentation, LineChart, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SystemPitch() {
    return (
        <div className="min-h-screen bg-zinc-950 font-sans text-white overflow-hidden relative">
            {/* Background Glows */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none opacity-50 blur-[120px]">
                <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full mix-blend-screen" />
                <div className="absolute top-40 right-1/4 w-[30rem] h-[30rem] bg-indigo-600/10 rounded-full mix-blend-screen" />
            </div>

            <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 pb-32">
                
                {/* Hero Section */}
                <div className="text-center mb-24 max-w-3xl mx-auto relative">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent font-bold text-sm mb-8">
                        <Zap className="w-4 h-4" /> THE NEXT EVOLUTION OF SAE GROUP
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1] mb-8">
                        PJ's Vision for the <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
                            SAE Operating System
                        </span>
                    </h1>
                    <p className="text-xl text-zinc-400 leading-relaxed font-medium">
                        My vision to optimize every department, train the next generation of builders, and run the entire business through one unified platform.
                    </p>
                </div>

                {/* The Role Definition */}
                <div className="mb-24">
                    <h2 className="text-3xl font-black mb-12 text-center">My Proposed Role & Strategy</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="bg-zinc-900/40 border border-zinc-800/50 p-8 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-accent/40 transition-colors duration-300">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full -z-10 group-hover:bg-blue-500/10 transition-colors" />
                            <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center mb-6 border border-zinc-700 shadow-inner">
                                <Workflow className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">1. Ground Truth First</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                                I want to learn the builds directly from the guys on the floor. We need to figure out a schedule that lets me do both—like a 4-day-a-week schedule in the bay to get that critical seat time, while dedicating focus to building out this system and managing ops.
                            </p>
                        </div>

                        <div className="bg-zinc-900/40 border border-zinc-800/50 p-8 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-indigo-500/40 transition-colors duration-300 transform md:-translate-y-4">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full -z-10 group-hover:bg-indigo-500/10 transition-colors" />
                            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-6 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                                <ShieldCheck className="w-6 h-6 text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">2. Manage & Optimize</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                                I feel I can be the absolute best benefit here. Let me help optimize every single department. I will build Standard Operating Procedures (SOPs) and manage efficiency across the board.
                            </p>
                        </div>

                        <div className="bg-zinc-900/40 border border-zinc-800/50 p-8 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-purple-500/40 transition-colors duration-300">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-bl-full -z-10 group-hover:bg-purple-500/10 transition-colors" />
                            <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center mb-6 border border-zinc-700 shadow-inner">
                                <UserPlus className="w-6 h-6 text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">3. Scale the Team</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                                With iron-clad SOPs and this integrated platform, we can train new employees rapidly and consistently. It stops tribal knowledge from bottlenecking our growth.
                            </p>
                        </div>
                    </div>
                </div>

                <hr className="border-t border-zinc-800/50 mb-24 max-w-4xl mx-auto" />

                {/* The Platform Vision Bento Box */}
                <div className="mb-24">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-black mb-4">The Unified Platform Vision</h2>
                        <p className="text-zinc-400 max-w-2xl mx-auto font-medium">
                            We will make the entire business run through this website. It replaces 90% of our external, fragmented, and expensive tools.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-5xl mx-auto">
                        
                        {/* Large Bento Card 1 */}
                        <div className="md:col-span-8 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-8 sm:p-10 rounded-3xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-10 blur-[1px] group-hover:opacity-20 transition-opacity">
                                <Building2 className="w-48 h-48 text-blue-500" />
                            </div>
                            <div className="relative z-10 w-full">
                                <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-2xl mb-6 border border-blue-500/20">
                                    <Globe className="w-7 h-7 text-blue-400" />
                                </div>
                                <h3 className="text-2xl font-bold mb-4">The Public Face & Subsidiaries</h3>
                                <p className="text-zinc-400 leading-relaxed max-w-md">
                                    This codebase natively hosts and manages all of our public-facing websites. Customers, Wraps, Harnesses, and Pallet builds—all centralized. No more fragmented WordPress sites or disjointed branding.
                                </p>
                            </div>
                        </div>

                        {/* Smaller Bento Card 1 */}
                        <div className="md:col-span-4 bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 p-8 rounded-3xl flex flex-col justify-center relative overflow-hidden group">
                            <div className="absolute -bottom-6 -right-6 opacity-10 group-hover:opacity-20 transition-opacity">
                                <LayoutDashboard className="w-32 h-32 text-indigo-500" />
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-xl font-bold mb-3 text-white">Staff Portal</h3>
                                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                                    The ultimate internal Operations Command. Inventory, daily logs, rig management, and internal comms all live here.
                                </p>
                                <ul className="space-y-2 text-sm text-zinc-300 font-medium">
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Replaces 90% of tools</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unified daily logs</li>
                                </ul>
                            </div>
                        </div>

                        {/* Smaller Bento Card 2 */}
                        <div className="md:col-span-5 bg-gradient-to-tr from-zinc-900 to-zinc-950 border border-zinc-800 p-8 rounded-3xl relative overflow-hidden group">
                            <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <FileSignature className="w-24 h-24 text-emerald-500" />
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-xl font-bold mb-3 text-white">Customer Portals</h3>
                                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                                    Bespoke client dashboards for law enforcement, municipalities, and private builds. 
                                </p>
                                <ul className="space-y-2 text-sm text-zinc-300 font-medium">
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-accent" /> Manage Job Status In-Real-Time</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-accent" /> Integrated Secure Billing & Payments</li>
                                </ul>
                            </div>
                        </div>

                        {/* Large Bento Card 2 */}
                        <div className="md:col-span-7 bg-gradient-to-l from-zinc-900 to-zinc-950 border border-zinc-800 p-8 sm:p-10 rounded-3xl flex items-center relative overflow-hidden group">
                            <div className="relative z-10 w-full">
                                <div className="inline-flex items-center justify-center p-3 bg-purple-500/10 rounded-2xl mb-6 border border-purple-500/20">
                                    <LineChart className="w-7 h-7 text-purple-400" />
                                </div>
                                <h3 className="text-2xl font-bold mb-4">Unlocking True Efficiency</h3>
                                <p className="text-zinc-400 leading-relaxed max-w-lg mb-6">
                                    By bridging the gap between the mechanic bay, the drafting table, our sales engines, and customer transparency, we eliminate bottlenecks and maximize profit margins on every single build.
                                </p>
                                <Link to="/ops" className="inline-flex items-center gap-2 font-bold text-sm text-white hover:text-purple-400 transition-colors">
                                    View Operations Command <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Final Call to Action */}
                <div className="text-center bg-zinc-900/60 border border-zinc-800 rounded-3xl p-12 relative overflow-hidden">
                     <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
                     <div className="relative z-10">
                        <Presentation className="w-12 h-12 text-blue-500 mx-auto mb-6" />
                        <h2 className="text-3xl font-black mb-4">Let me build this engine.</h2>
                        <p className="text-zinc-400 max-w-xl mx-auto font-medium mb-8">
                            Give me the seat time to learn the intricacies of our builds, and the autonomy to build the standard operating procedures that will make SAE Group the undisputed operational leader in the industry. Let's figure out a schedule that makes this happen.
                        </p>
                    </div>
                </div>

            </main>
        </div>
    );
}

// Arrow helper
function ArrowRight({className}: {className?: string}) {
    return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
}
