import { Activity, QrCode, Wrench, Search, ArrowRight, ShieldCheck, Zap, ClipboardList, Eye, User } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PlatformGuide() {
    const modules = [
        {
            title: "Ops Command",
            description: "Mission Control for the shop floor. Features top-down bay tracking, live parts blockage identification, parking queue staging, and a real-time dispatch stream.",
            icon: Activity,
            link: "/ops",
            color: "text-red-500",
            bgColor: "bg-red-500/10",
            borderColor: "border-red-500/20",
            tags: ["Bay Statuses", "Bottlenecks", "Queue Management"]
        },
        {
            title: "Technician Portal",
            description: "The personal dashboard for technicians. Tracks weekly book-time goals for benefits, allows clocking in/out, and presents assignments grouped by vehicle Work Orders.",
            icon: Wrench,
            link: "/tech",
            color: "text-accent",
            bgColor: "bg-accent/10",
            borderColor: "border-accent/20",
            tags: ["Personal Metrics", "Job Grouping", "Shop Pool"]
        },
        {
            title: "Deep Dive Jobs",
            description: "Granular, multi-assignee task tracking per vehicle. Features actual vs. book time discrepancies, integrated parts status, and automated ETA block warnings.",
            icon: Search,
            link: "/jobs/mock",
            color: "text-emerald-500",
            bgColor: "bg-emerald-500/10",
            borderColor: "border-emerald-500/20",
            tags: ["Time Tracking", "SOP Media", "Live Timeline"]
        },
        {
            title: "QR Workflow",
            description: "Every vehicle receives a physical sticker. Scanning the QR code acts as the universal entry point, instantly pulling up its Deep Dive profile for techs or admins.",
            icon: QrCode,
            link: "/jobs/mock",
            color: "text-purple-500",
            bgColor: "bg-purple-500/10",
            borderColor: "border-purple-500/20",
            tags: ["Instant Access", "Asset Tagging", "Mobile First"]
        },
        {
            title: "Daily Logs",
            description: "Personal logging system for tracking efficiency ideas, hr notes, and operational issues. Features persistent threaded comments and integrated tagging.",
            icon: ClipboardList,
            link: "/logs",
            color: "text-blue-500",
            bgColor: "bg-blue-500/10",
            borderColor: "border-blue-500/20",
            tags: ["Issue Tracking", "Threaded Notes", "History"]
        },
        {
            title: "System Vision",
            description: "The interactive presentation outlining the transition into Operations Management. Details tool consolidation and automated workflows.",
            icon: Eye,
            link: "/vision",
            color: "text-pink-500",
            bgColor: "bg-pink-500/10",
            borderColor: "border-pink-500/20",
            tags: ["Operations", "Consolidation", "Pitch"]
        },
        {
            title: "Customer Portal",
            description: "A highly polished, client-facing dashboard mockup displaying real-time vehicle statuses, photo galleries, threaded comms, and billing logic.",
            icon: User,
            link: "/customer/demo",
            color: "text-amber-500",
            bgColor: "bg-amber-500/10",
            borderColor: "border-amber-500/20",
            tags: ["Live Tracking", "Invoices", "Communication"]
        }
    ];

    return (
        <div className="flex-1 bg-zinc-950 p-4 md:p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto py-8">

                {/* Header */}
                <div className="text-center mb-16 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-accent/10 rounded-full blur-[100px] pointer-events-none"></div>
                    <div className="relative z-10">
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-bold uppercase tracking-widest text-zinc-400 mb-6 shadow-sm">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            System Sandbox Ready
                        </span>
                        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6">
                            SAE OS <span className="text-accent tracking-normal">Demo Hub</span>
                        </h1>
                        <p className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed font-medium">
                            Select a module below to explore the high-fidelity mockups demonstrating the future of our operational workflows.
                        </p>
                    </div>
                </div>

                {/* Feature Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    {modules.map((mod, index) => (
                        <Link to={mod.link} key={index} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 hover:border-zinc-700 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 group flex flex-col justify-between block">
                            <div>
                                <div className="flex items-start justify-between mb-6">
                                    <div className={`w-14 h-14 rounded-xl ${mod.bgColor} border ${mod.borderColor} flex items-center justify-center shadow-inner`}>
                                        <mod.icon className={`w-7 h-7 ${mod.color}`} />
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-white group-hover:text-zinc-950 transition-colors">
                                        <ArrowRight className="w-5 h-5 -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                                    </div>
                                </div>

                                <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-accent transition-colors">{mod.title}</h3>
                                <p className="text-zinc-400 leading-relaxed font-medium mb-6">
                                    {mod.description}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap mt-auto pt-6 border-t border-zinc-800/50">
                                {mod.tags.map((tag, tagIndex) => (
                                    <span key={tagIndex} className="text-[10px] font-bold uppercase tracking-wider bg-zinc-950 text-zinc-500 border border-zinc-800 px-2 py-1 rounded">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </Link>
                    ))}
                </div>

                {/* Bottom Graphic / Secondary Callout */}
                <div className="mt-16 bg-gradient-to-r from-zinc-900 to-zinc-900/50 rounded-2xl border border-zinc-800 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-1/2 h-full bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>
                    <div className="relative z-10 max-w-xl">
                        <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                            <Zap className="w-6 h-6 text-yellow-400" /> Performance & Scale
                        </h3>
                        <p className="text-zinc-400 font-medium leading-relaxed">
                            These prototypes demonstrate the end-goal user experience. The ultimate objective is to tie these unified front-end views to live Firestore backends, eliminating payroll lag, preventing lost inventory, and establishing true accountability across all subsidiaries.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
