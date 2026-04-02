import { Bug, Lightbulb, MessageSquare, Camera, ScanLine } from 'lucide-react';

export const FeedbackGuideDoc = () => {
    return (
        <div className="animate-in fade-in max-w-3xl prose-invert pb-20">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">Feedback & Idea Board</h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
                We believe the best improvements come from the people using the platform every day. This guide explains how to use the Global Feedback Widget to report issues, ask questions, or pitch new operational ideas.
            </p>

            <div className="space-y-12">
                
                {/* Section 1 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                            <MessageSquare className="w-5 h-5 text-indigo-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">The Global Widget</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed text-sm mb-6">
                            Floating in the bottom right corner of almost every screen is the <strong>Global Feedback Widget</strong>. You can click this at any time, without losing your current work, to send a message to the engineering and management teams.
                        </p>

                        <div className="space-y-4">
                            <div className="flex items-start gap-4 bg-black/50 border border-zinc-800 rounded-xl p-4">
                                <Bug className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="text-white text-sm block mb-1">1. Report a Bug</strong>
                                    <p className="text-zinc-400 text-xs leading-relaxed">
                                        Did something break? Did a QR tag scan incorrectly? Select the "Bug" option to flag an immediate issue. This automatically alerts the developers.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-4 bg-black/50 border border-zinc-800 rounded-xl p-4">
                                <MessageSquare className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="text-white text-sm block mb-1">2. Ask a Question</strong>
                                    <p className="text-zinc-400 text-xs leading-relaxed">
                                        Not sure how a specific module works? Select "Question" to reach out for help. Management can review these to identify where better training is needed.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 bg-black/50 border border-zinc-800 rounded-xl p-4">
                                <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="text-white text-sm block mb-1">3. Suggest an Idea</strong>
                                    <p className="text-zinc-400 text-xs leading-relaxed">
                                        Have a brilliant idea to speed up workflow or a feature request for the app? Pitch it! Ideas are collected and can be scheduled into the development roadmap.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 2 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
                            <Camera className="w-5 h-5 text-emerald-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Visual Context & Telemetry</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed text-sm mb-4">
                            Describing a technical issue through text alone can be difficult. The Feedback Widget includes advanced, built-in telemetry capturing.
                        </p>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <ScanLine className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                                <span className="text-zinc-300 text-sm leading-relaxed">
                                    <strong className="text-white block">Automated Screenshots</strong>
                                    When you submit feedback, the platform can automatically capture a screenshot of the exact view you're looking at. This provides developers unparalleled context to diagnose routing or UI errors instantly.
                                </span>
                            </li>
                            <li className="flex items-start gap-3">
                                <ScanLine className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                                <span className="text-zinc-300 text-sm leading-relaxed">
                                    <strong className="text-white block">Environment Telemetry</strong>
                                    Under the hood, the widget securely packages your Tenant ID, Current User Context, and API path details without requiring you to manually explain where you are in the application.
                                </span>
                            </li>
                        </ul>
                    </div>
                </section>

            </div>
        </div>
    );
};
