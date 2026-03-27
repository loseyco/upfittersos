import { Shield, ChevronRight, Activity, Zap, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CustomsPage() {
    return (
        <div className="bg-zinc-950 min-h-screen text-white">

            {/* Header / Nav */}
            <nav className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="text-xl font-black text-white flex items-center gap-2">
                        <Shield className="w-6 h-6 text-accent" /> SAE CUSTOMS
                    </Link>
                    <Link to="/login" className="text-sm font-bold text-zinc-400 hover:text-white transition-colors">Client Portal</Link>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="relative pt-32 pb-20 sm:pt-40 sm:pb-24 overflow-hidden border-b border-zinc-900">
                <img src="/images/customs_hero.png" alt="SAE Customs Garage" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity -z-20" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/20 via-zinc-950/90 to-zinc-950 -z-10"></div>
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold uppercase tracking-wider mb-6">
                        <Activity className="w-3.5 h-3.5" /> Law Enforcement Upfitting
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
                        Mission Critical <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-blue-400">Engineering.</span>
                    </h1>
                    <p className="max-w-2xl mx-auto text-lg text-zinc-400 font-medium mb-10">
                        The core of our operations. We build pursuit-rated vehicles designed for absolute reliability when seconds matter. From bespoke harnesses to custom mounting solutions.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <button className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2">
                            Request a Build <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Features Section */}
            <div className="py-24 max-w-7xl mx-auto px-6">
                <div className="grid md:grid-cols-3 gap-8">
                    {[
                        { title: 'Zero Tolerance Wiring', desc: 'Custom loom routing eliminating electrical gremlins entirely. Every crimp is QA inspected.', icon: Zap },
                        { title: 'Pursuit Rated', desc: 'Upfits designed alongside active LEO feedback for combat-ready durability in high-stress environments.', icon: Shield },
                        { title: 'Turnkey Delivery', desc: 'From the dealership lot directly to your precinct. We handle Title, Tags, and full technology integration.', icon: CheckCircle2 }
                    ].map((feature, i) => (
                        <div key={i} className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl hover:border-accent/50 transition-colors">
                            <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-6">
                                <feature.icon className="w-6 h-6 text-accent" />
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
