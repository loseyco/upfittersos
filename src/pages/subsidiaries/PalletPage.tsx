import { Truck, ChevronRight, PackageOpen, Bolt, PenTool } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PalletPage() {
    return (
        <div className="bg-zinc-950 min-h-screen text-white">

            {/* Header / Nav */}
            <nav className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="text-xl font-black text-white flex items-center gap-2">
                        <Truck className="w-6 h-6 text-emerald-500" /> ON A PALLET
                    </Link>
                    <Link to="/login" className="text-sm font-bold text-zinc-400 hover:text-white transition-colors">Client Portal</Link>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="relative pt-32 pb-20 sm:pt-40 sm:pb-24 overflow-hidden border-b border-zinc-900">
                <img src="/images/pallet_hero.png" alt="Police Car on a Pallet Delivery" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity -z-20" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-zinc-950/90 to-zinc-950 -z-10"></div>
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-wider mb-6">
                        <PackageOpen className="w-3.5 h-3.5" /> Turnkey Upfitting Kits
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
                        For the DIY Agency <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">& Small Auto Shop.</span>
                    </h1>
                    <p className="max-w-2xl mx-auto text-lg text-zinc-300 font-medium mb-10">
                        We took all the thinking out of it. We provide everything you need to build your police car pre-programmed at one low price. Look like a rockstar to your Chief!
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 border border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                            Configure a Pallet <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Features Section */}
            <div className="py-24 max-w-7xl mx-auto px-6">
                <div className="grid md:grid-cols-3 gap-8">
                    {[
                        { title: 'Consolidated Shipping', desc: 'Lights, sirens, partitions, weapon mounts, and consoles. All arriving together, minimizing inventory loss.', icon: PackageOpen },
                        { title: 'Pre-Assembled Subcomponents', desc: 'Push bumpers come dressed with speakers and lights. Consoles come pre-populated.', icon: PenTool },
                        { title: 'Drop-In Ready', desc: 'Combines with our Qwik Harness system so your mechanics spend time bolting, not crimping.', icon: Bolt }
                    ].map((feature, i) => (
                        <div key={i} className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl hover:border-emerald-500/30 transition-colors group">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-emerald-500/20 transition-colors">
                                <feature.icon className="w-6 h-6 text-emerald-500" />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <footer className="py-12 border-t border-zinc-900 text-center">
                <Link to="/" className="text-sm font-bold text-zinc-500 hover:text-white">&larr; Back to SAE Group</Link>
            </footer>

        </div>
    );
}
