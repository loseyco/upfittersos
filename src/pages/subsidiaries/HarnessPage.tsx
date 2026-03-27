import { Wrench, ChevronRight, Zap, Plug, Settings2, PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function HarnessPage() {
    return (
        <div className="bg-zinc-950 min-h-screen text-white">

            {/* Header / Nav */}
            <nav className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="text-xl font-black text-white flex items-center gap-2">
                        <Wrench className="w-6 h-6 text-amber-500" /> QWIK HARNESS
                    </Link>
                    <Link to="/login" className="text-sm font-bold text-zinc-400 hover:text-white transition-colors">Client Portal</Link>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="relative pt-32 pb-20 sm:pt-40 sm:pb-24 overflow-hidden border-b border-zinc-900">
                <img src="/images/harness_hero.png" alt="Qwik Harness Engineering" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity -z-20" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-zinc-950/90 to-zinc-950 -z-10"></div>
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold uppercase tracking-wider mb-6">
                        <Zap className="w-3.5 h-3.5" /> Plug & Play Electrical
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
                        Specializing In <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-400">Qwik Install Harnesses.</span>
                    </h1>
                    <p className="max-w-2xl mx-auto text-lg text-zinc-300 font-medium mb-10">
                        Plug & Play Harnesses for emergency vehicles and work trucks. Complete 3-wire solutions eliminating hours of slicing and diagnostic headaches.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <button className="bg-amber-600 hover:bg-amber-500 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 border border-amber-400/50 shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                            Shop Harnesses <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Features Section */}
            <div className="py-24 max-w-7xl mx-auto px-6">
                <div className="grid md:grid-cols-3 gap-8">
                    {[
                        { title: 'No Wire Splicing', desc: 'Preserve OEM warranties. Our kits interface directly with factory data links and power centers.', icon: Plug },
                        { title: 'Pre-Programmed Core', desc: 'Whelen Core and generic outputs logically mapped. Just match the labeled connectors to your equipment.', icon: Settings2 },
                        { title: 'Standardized Kits', desc: 'Designed specifically for Ford PIU, Chevy Tahoe PPV, and Dodge Charger Pursuit platforms.', icon: PackageCheck }
                    ].map((feature, i) => (
                        <div key={i} className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl hover:border-amber-500/30 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <feature.icon className="w-6 h-6 text-amber-500" />
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
