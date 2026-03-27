import { FileText, PieChart, ShieldCheck, Users } from 'lucide-react';

export function SalesEngine() {
    return (
        <div className="flex-1 bg-zinc-950 p-4 md:p-8">
            <div className="max-w-[1600px] mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                            <PieChart className="w-8 h-8 text-accent" />
                            Revenue & Quoting Engine
                        </h2>
                        <p className="mt-2 text-zinc-400">Manage fleet contracts, department bids, and build quotes.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-700">
                            Client Directory
                        </button>
                        <button className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
                            New Upfit Quote
                        </button>
                    </div>
                </div>

                {/* Top KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 border-l-4 border-l-emerald-500">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-zinc-400 text-sm font-medium">Monthly Revenue</div>
                        </div>
                        <div className="text-3xl font-bold text-white">$482k <span className="text-sm font-normal text-emerald-400">+12% YoY</span></div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 border-l-4 border-l-accent">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-zinc-400 text-sm font-medium">Active Proposals</div>
                            <FileText className="w-4 h-4 text-accent" />
                        </div>
                        <div className="text-3xl font-bold text-white">18 <span className="text-sm font-normal text-zinc-500">$1.2M Pipeline</span></div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 border-l-4 border-l-purple-500">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-zinc-400 text-sm font-medium">Win Rate (Q3)</div>
                            <ShieldCheck className="w-4 h-4 text-purple-500" />
                        </div>
                        <div className="text-3xl font-bold text-white">68% <span className="text-sm font-normal text-zinc-500">Avg Cycle: 34d</span></div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 border-l-4 border-l-yellow-500">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-zinc-400 text-sm font-medium">New Departments</div>
                            <Users className="w-4 h-4 text-yellow-500" />
                        </div>
                        <div className="text-3xl font-bold text-white">3 <span className="text-sm font-normal text-zinc-500">This Quarter</span></div>
                    </div>
                </div>

                {/* Pipeline Board */}
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white mb-4">Contract Pipeline</h3>
                    <div className="tour-sales-pipeline grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 overflow-x-auto pb-4">

                        {/* Column 1: Discovery */}
                        <div className="flex flex-col gap-3 min-w-[300px]">
                            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                                <span className="font-semibold text-zinc-300">Discovery</span>
                                <span className="bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 text-xs">2</span>
                            </div>
                            {[
                                { cl: "Schaumburg PD", val: "$45,000", units: "3 Tahoes" },
                                { cl: "IL State Police", val: "$120,000", units: "8 Explorers" },
                            ].map((card, i) => (
                                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 cursor-grab">
                                    <h4 className="font-medium text-white">{card.cl}</h4>
                                    <div className="flex justify-between mt-3 text-sm">
                                        <span className="text-zinc-400">{card.units}</span>
                                        <span className="font-semibold text-emerald-400">{card.val}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Column 2: Quoting */}
                        <div className="flex flex-col gap-3 min-w-[300px]">
                            <div className="flex items-center justify-between bg-zinc-900 border-t-2 border-t-blue-500 border border-zinc-800 rounded-lg p-3">
                                <span className="font-semibold text-zinc-300">Quoting / Engineering</span>
                                <span className="bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 text-xs">1</span>
                            </div>
                            {[
                                { cl: "Crystal Lake Fire", val: "$85,000", units: "2 Command F-250s" },
                            ].map((card, i) => (
                                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 cursor-grab">
                                    <h4 className="font-medium text-white">{card.cl}</h4>
                                    <div className="flex justify-between mt-3 text-sm">
                                        <span className="text-zinc-400">{card.units}</span>
                                        <span className="font-semibold text-emerald-400">{card.val}</span>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-orange-400 font-medium">Awaiting Spec Sheet from Tech</div>
                                </div>
                            ))}
                        </div>

                        {/* Column 3: Proposal Sent */}
                        <div className="flex flex-col gap-3 min-w-[300px]">
                            <div className="flex items-center justify-between bg-zinc-900 border-t-2 border-t-yellow-500 border border-zinc-800 rounded-lg p-3">
                                <span className="font-semibold text-zinc-300">Proposal Sent</span>
                                <span className="bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 text-xs">1</span>
                            </div>
                            {[
                                { cl: "Private Security Firm", val: "$22,000", units: "4 Dodge Chargers" },
                            ].map((card, i) => (
                                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 cursor-grab">
                                    <h4 className="font-medium text-white">{card.cl}</h4>
                                    <div className="flex justify-between mt-3 text-sm">
                                        <span className="text-zinc-400">{card.units}</span>
                                        <span className="font-semibold text-emerald-400">{card.val}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Column 4: Closed Won */}
                        <div className="flex flex-col gap-3 min-w-[300px]">
                            <div className="flex items-center justify-between bg-zinc-900 border-t-2 border-t-emerald-500 border border-zinc-800 rounded-lg p-3">
                                <span className="font-semibold text-zinc-300">Closed Won (Push to Ops)</span>
                                <span className="bg-green-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 text-xs">Ready</span>
                            </div>
                            <div className="border border-dashed border-zinc-700 rounded-xl p-4 text-center text-sm text-zinc-500 flex flex-col items-center justify-center gap-2 h-24 hover:border-zinc-500 hover:text-zinc-400 transition-colors cursor-pointer">
                                Drop to transfer to Logistics
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    )
}
