import { Shield, Wrench, Layers, Truck, MapPin, Phone, Mail, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PublicHero() {
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
                                ONE PARTNER.
                            </div>
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-white flex flex-col items-center sm:text-7xl mb-6">
                            From Spec to <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-[#0ea5e9] mt-2">Mission Ready</span>
                        </h1>
                        <p className="mt-6 text-lg xl:text-xl leading-8 text-zinc-300 font-medium max-w-2xl mx-auto">
                            The central operating system for SAE Group. Access the Tech Portal, Ops Command, and active Job Tracking directly through SAE OS.
                        </p>
                    </div>
                </div>
            </div>

            {/* MISSION STATEMENT */}
            <div className="py-24 sm:py-32 bg-zinc-900/30 border-b border-zinc-900">
                <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
                    <Shield className="w-12 h-12 text-accent mx-auto mb-8 opacity-80" />
                    <h2 className="text-base font-bold tracking-widest text-zinc-500 uppercase mb-6">Our Mission</h2>
                    <p className="text-xl md:text-3xl font-medium leading-relaxed text-zinc-200 tracking-tight">
                        "We seamlessly blend creativity, precision, and functionality to transform vehicles into unique, custom masterpieces. We are dedicated to exceeding expectations through unparalleled craftsmanship, driving the evolution of vehicle upfitting and setting new benchmarks in the industry."
                    </p>
                </div>
            </div>

            {/* SUBSIDIARIES GRID */}
            <div className="py-24 sm:py-32">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="mx-auto max-w-2xl lg:text-center mb-16">
                        <h2 className="text-base font-bold tracking-widest text-accent uppercase">The Network</h2>
                        <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Four Divisions. One Unrivaled Standard.</p>
                    </div>
                    <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
                        <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-4">

                            <div className="flex flex-col bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-600 transition-colors">
                                <dt className="flex items-center gap-x-3 text-lg font-bold leading-7 text-white mb-4">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-accent/20 border border-accent/20">
                                        <Shield className="h-5 w-5 text-accent" aria-hidden="true" />
                                    </div>
                                    SAE Customs
                                </dt>
                                <dd className="mt-1 flex flex-auto flex-col text-sm leading-6 text-zinc-400">
                                    <p className="flex-auto">The core of our upfitting operations. Precision engineering for law enforcement, emergency response, and commercial fleets.</p>
                                    <p className="mt-6"><Link to="/customs" className="text-sm font-semibold leading-6 text-accent hover:text-white transition-colors">Explore SAE Customs <span aria-hidden="true">→</span></Link></p>
                                </dd>
                            </div>

                            <div className="flex flex-col bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-600 transition-colors">
                                <dt className="flex items-center gap-x-3 text-lg font-bold leading-7 text-white mb-4">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-pink-500/10 border border-pink-500/20">
                                        <Layers className="h-5 w-5 text-pink-500" aria-hidden="true" />
                                    </div>
                                    Wrap Guyz
                                </dt>
                                <dd className="mt-1 flex flex-auto flex-col text-sm leading-6 text-zinc-400">
                                    <p className="flex-auto">Industry-leading vehicle wraps, aesthetic overhauls, and commercial branding graphics applied with flawless precision.</p>
                                    <p className="mt-6"><Link to="/wraps" className="text-sm font-semibold leading-6 text-pink-500 hover:text-white transition-colors">Explore Wrap Guyz <span aria-hidden="true">→</span></Link></p>
                                </dd>
                            </div>

                            <div className="flex flex-col bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-600 transition-colors">
                                <dt className="flex items-center gap-x-3 text-lg font-bold leading-7 text-white mb-4">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
                                        <Wrench className="h-5 w-5 text-amber-500" aria-hidden="true" />
                                    </div>
                                    Qwik Harness
                                </dt>
                                <dd className="mt-1 flex flex-auto flex-col text-sm leading-6 text-zinc-400">
                                    <p className="flex-auto">Revolutionary, plug-and-play wiring harnesses designed to drastically reduce upfit times and eliminate electrical gremlins.</p>
                                    <p className="mt-6"><Link to="/harness" className="text-sm font-semibold leading-6 text-amber-500 hover:text-white transition-colors">Explore Qwik Harness <span aria-hidden="true">→</span></Link></p>
                                </dd>
                            </div>

                            <div className="flex flex-col bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-600 transition-colors">
                                <dt className="flex items-center gap-x-3 text-lg font-bold leading-7 text-white mb-4">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        <Truck className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                                    </div>
                                    Police Car on a Pallet
                                </dt>
                                <dd className="mt-1 flex flex-auto flex-col text-sm leading-6 text-zinc-400">
                                    <p className="flex-auto">Turnkey upfitting kits delivered directly to your bay. Everything you need to construct a pursuit vehicle in one structured package.</p>
                                    <p className="mt-6"><Link to="/pallet" className="text-sm font-semibold leading-6 text-emerald-500 hover:text-white transition-colors">Explore Pallet Kits <span aria-hidden="true">→</span></Link></p>
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
                        <h3 className="text-white font-black text-xl mb-4 tracking-tight">SAE GROUP</h3>
                        <p className="text-sm text-zinc-400">From Spec to Mission Ready.</p>
                    </div>

                    <div>
                        <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-accent" /> Location</h4>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            4012 Main Street<br />
                            McHenry, IL 60050
                        </p>
                    </div>

                    <div>
                        <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4 flex items-center gap-2"><Phone className="w-4 h-4 text-accent" /> Contact</h4>
                        <ul className="space-y-3 text-sm text-zinc-400">
                            <li><a href="tel:1-847-999-7999" className="hover:text-white transition-colors">1-847-999-7999</a></li>
                            <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> <a href="mailto:sales@saegrp.com" className="hover:text-white transition-colors">sales@saegrp.com</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-bold text-sm tracking-wider uppercase mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Business Hours</h4>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Monday - Friday<br />
                            8:00 AM - 4:30 PM
                        </p>
                    </div>

                </div>
                <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-12 pt-8 border-t border-zinc-900 flex flex-col md:flex-row justify-between items-center">
                    <p className="text-xs text-zinc-600">&copy; 2026 SAE Group. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
