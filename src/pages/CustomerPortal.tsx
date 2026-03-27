import { CheckCircle2, ChevronRight, MessageSquare, ShieldCheck, Clock, CreditCard, Camera, Settings } from 'lucide-react';

export function CustomerPortal() {
    return (
        <div className="min-h-[calc(100vh-64px)] bg-zinc-950 font-sans text-white">
            {/* Header Area */}
            <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-8 md:px-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="max-w-5xl mx-auto relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <ShieldCheck className="w-8 h-8 text-accent" />
                            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">SAE Portal</h1>
                        </div>
                        <p className="text-zinc-400 font-medium">Welcome back, Chief O'Malley • Rockford PD</p>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6">
                
                {/* Active Vehicle Status Card */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm relative">
                    {/* Status Bar */}
                    <div className="bg-accent/10 border-b border-accent/20 p-4 flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                            <span className="text-sm font-bold text-emerald-400 tracking-wider uppercase">Active Upfit</span>
                        </div>
                        <div className="text-sm font-medium text-zinc-400">Est. Completion: <span className="text-white font-bold tracking-wide">Mar 28, 2026</span></div>
                    </div>
                    
                    <div className="p-6 md:p-8">
                        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                            <div className="flex-1">
                                <h2 className="text-3xl font-black text-white mb-1">2026 Chevrolet Tahoe PPV</h2>
                                <p className="text-zinc-500 font-mono text-sm mb-6">VIN: 1GNLCKD1XR123456 • RO #8842</p>

                                {/* Progress Track */}
                                <div className="space-y-6 max-w-lg mt-10">
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center border border-emerald-500/30 z-10">
                                                <CheckCircle2 className="w-5 h-5" />
                                            </div>
                                            <div className="w-px h-full bg-zinc-800 -my-2"></div>
                                        </div>
                                        <div className="pb-8">
                                            <h4 className="text-white font-bold text-sm">Intake & Inspection</h4>
                                            <p className="text-zinc-500 text-xs mt-1">Vehicle securely received and checked in.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center border border-emerald-500/30 z-10">
                                                <CheckCircle2 className="w-5 h-5" />
                                            </div>
                                            <div className="w-px h-full bg-zinc-800 -my-2"></div>
                                        </div>
                                        <div className="pb-8">
                                            <h4 className="text-white font-bold text-sm">Disassembly & Pre-wire <span className="ml-2 text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Qwik Harness</span></h4>
                                            <p className="text-zinc-500 text-xs mt-1">Interior removed; proprietary harness installed.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)] z-10">
                                                <Settings className="w-4 h-4 animate-spin-slow" />
                                            </div>
                                            <div className="w-px h-full bg-zinc-800 -my-2"></div>
                                        </div>
                                        <div className="pb-8">
                                            <h4 className="text-accent font-bold text-sm">Equipment Installation</h4>
                                            <p className="text-blue-300/70 text-xs mt-1">Mounting lightbar, push bumper, and console.</p>
                                            <div className="mt-3 flex gap-2">
                                                <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Bay 3</span>
                                                <span className="text-[10px] font-bold px-2 py-1 rounded bg-zinc-800 text-zinc-400">Tech: PJ</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center border border-zinc-700 z-10">
                                                <Clock className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-zinc-500 font-bold text-sm">Quality Control & Delivery</h4>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Photo Gallery Mockup */}
                            <div className="w-full md:w-72 space-y-4">
                                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2"><Camera className="w-4 h-4 text-accent" /> Latest Photos</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="aspect-square bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center group overflow-hidden relative">
                                            <div className="absolute inset-0 bg-gradient-to-tr from-zinc-800 to-zinc-700 opacity-50"></div>
                                            <span className="text-[10px] text-zinc-500 relative z-10 font-bold">Front Bumper</span>
                                        </div>
                                        <div className="aspect-square bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center group overflow-hidden relative">
                                            <div className="absolute inset-0 bg-gradient-to-tr from-zinc-800 to-zinc-700 opacity-50"></div>
                                            <span className="text-[10px] text-zinc-500 relative z-10 font-bold">Center Console</span>
                                        </div>
                                        <div className="aspect-square bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center group overflow-hidden relative">
                                            <div className="absolute inset-0 bg-gradient-to-tr from-zinc-800 to-zinc-700 opacity-50"></div>
                                            <span className="text-[10px] text-zinc-500 relative z-10 font-bold">Trunk Tray</span>
                                        </div>
                                        <div className="aspect-square bg-zinc-900 border border-zinc-800 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-accent/50 transition-colors">
                                            <span className="text-xs font-bold text-accent">+3 More</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Lower Grid: Messages & Billing */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Messaging Widget */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 relative group overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform">
                            <MessageSquare className="w-24 h-24" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-purple-400" /> Direct Communication</h3>
                        <p className="text-sm text-zinc-400 mb-6 max-w-xs">Message your lead technician or account manager instantly.</p>
                        
                        <div className="space-y-3 mb-4">
                            <div className="bg-zinc-800/50 rounded-lg p-3 w-[85%] border border-zinc-700/50">
                                <span className="text-[10px] font-bold text-purple-400 block mb-1">Paul L. (Shop Manager)</span>
                                <p className="text-xs text-zinc-300">We noticed the rear partition mount was bent from a previous install. Want us to swap it with a new standard bracket?</p>
                            </div>
                            <div className="bg-accent/10 rounded-lg p-3 w-[85%] ml-auto border border-accent/20">
                                <span className="text-[10px] font-bold text-blue-400 block mb-1 text-right">You</span>
                                <p className="text-xs text-blue-100/80 text-right">Yeah, go ahead and swap it. Add it to the invoice.</p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <input type="text" placeholder="Type a message..." className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            <button className="bg-purple-500 hover:bg-purple-600 text-white p-2 rounded-lg font-bold transition-colors"><ChevronRight className="w-5 h-5"/></button>
                        </div>
                    </div>

                    {/* Billing Widget */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-400" /> Billing & Invoices</h3>
                        <div className="space-y-4">
                            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex justify-between items-center">
                                <div>
                                    <div className="text-sm font-bold text-white mb-0.5">Deposit: Tahoe #1</div>
                                    <div className="text-xs font-mono text-zinc-500">INV-4922 • Feb 15</div>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className="text-sm font-black text-white">$4,500.00</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 mt-1">PAID</span>
                                </div>
                            </div>
                            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex justify-between items-center relative overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent"></div>
                                <div>
                                    <div className="text-sm font-bold text-white mb-0.5">Final Balance: Tahoe #1</div>
                                    <div className="text-xs font-mono text-zinc-500">INV-4985 • Pending Completion</div>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className="text-sm font-black text-white">$6,285.50</span>
                                    <button className="text-[10px] font-bold px-3 py-1 rounded bg-accent text-white mt-1 hover:bg-accent-hover transition-colors">PAY NOW</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
