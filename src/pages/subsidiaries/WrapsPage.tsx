import { Layers, ChevronRight, Droplet, Maximize, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

export function WrapsPage() {
    return (
        <div className="bg-zinc-950 min-h-screen text-white">

            {/* Header / Nav */}
            <nav className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="text-xl font-black text-white flex items-center gap-2">
                        <Layers className="w-6 h-6 text-pink-500" /> WRAP GUYZ
                    </Link>
                    <Link to="/login" className="text-sm font-bold text-zinc-400 hover:text-white transition-colors">Client Portal</Link>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="relative pt-32 pb-20 sm:pt-40 sm:pb-24 overflow-hidden border-b border-zinc-900">
                <img src="/images/wraps_hero.png" alt="Wrap Guyz Installation" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity -z-20" />
                <img src="/images/wraps_hero_2.png" alt="Wrap Guyz Installation" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity -z-20" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-pink-500/10 via-zinc-950/90 to-zinc-950 -z-10"></div>
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-500 text-xs font-bold uppercase tracking-wider mb-6">
                        <Droplet className="w-3.5 h-3.5" /> High-End Vehicle Vinyl
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
                        Vehicle Wraps, <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">Signs & Banners.</span>
                    </h1>
                    <p className="max-w-2xl mx-auto text-lg text-zinc-300 font-medium mb-10">
                        We specialize in precision and fitting your content and designs to your choice of space. Take a look at what is possible here at Wrap Guyz located in Volo, Illinois.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <button className="bg-pink-600 hover:bg-pink-500 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 border border-pink-400/50 shadow-[0_0_20px_rgba(236,72,153,0.3)]">
                            Get a Quote <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Features Section */}
            <div className="py-24 max-w-7xl mx-auto px-6">
                <div className="grid md:grid-cols-3 gap-8">
                    {[
                        { title: 'Commercial Fleets', desc: 'Turn your delivery vans and service trucks into rolling billboards. We manage nationwide fleet branding.', icon: Maximize },
                        { title: 'Color Change Wraps', desc: 'Satin, Matte, Gloss, or Color-shift. Protect your OEM paint while driving a one-of-a-kind exotic finish.', icon: Droplet },
                        { title: 'Precision Templating', desc: 'In-house design team using digital templating for 100% accurate alignment on compound curves.', icon: Target }
                    ].map((feature, i) => (
                        <div key={i} className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl hover:border-pink-500/30 transition-colors group">
                            <div className="w-12 h-12 bg-pink-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-pink-500/20 transition-colors">
                                <feature.icon className="w-6 h-6 text-pink-500" />
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
