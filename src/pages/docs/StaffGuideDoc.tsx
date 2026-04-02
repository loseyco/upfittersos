import { Users, LayoutDashboard, Settings, UserCircle, Briefcase } from 'lucide-react';
import { APP_NAME } from '../../lib/constants';

export const StaffGuideDoc = () => {
    return (
        <div className="animate-in fade-in max-w-3xl prose-invert pb-20">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">Staff Onboarding Guide</h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
                Welcome to the {APP_NAME} workspace. This reference contains the essential information you need to navigate the platform, track your tasks, and manage your professional identity.
            </p>

            <div className="space-y-12">
                
                {/* Section 1 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-accent/20 rounded-lg border border-accent/30">
                            <LayoutDashboard className="w-5 h-5 text-accent" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">The Workspace Hub</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed text-sm mb-4">
                            Your dashboard is the central node for your daily operations. From here, you can access your assigned modules, view company-wide announcements, and jump directly into active operations.
                        </p>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <Users className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                                <span className="text-zinc-300 text-sm leading-relaxed">
                                    <strong className="text-white block">Coworkers Directory</strong>
                                    Access the internal directory to find out who's working on what. You can see your colleagues' avatars, check their roles, and quickly discover their contact information for seamless communication.
                                </span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Briefcase className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                                <span className="text-zinc-300 text-sm leading-relaxed">
                                    <strong className="text-white block">Task Assignments</strong>
                                    Keep an eye on the Tasks board to ensure you are up-to-date with your current responsibilities. Managers post assignments here, which update in real-time across the platform.
                                </span>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Section 2 */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                            <UserCircle className="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Your Professional Profile</h2>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                        <p className="text-zinc-300 leading-relaxed text-sm mb-6">
                            Your profile is your digital identity within the company. Keeping this up-to-date ensures accurate payroll processing and allows your team to recognize you easily.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-black/50 border border-zinc-800 rounded-xl p-4">
                                <h3 className="text-white font-bold text-sm mb-2">Legal Identity</h3>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    Ensure your Legal Name fields (First, Middle, Last, Suffix) are accurate. This data syncs securely with our HR backends and internal ledgers.
                                </p>
                            </div>
                            <div className="bg-black/50 border border-zinc-800 rounded-xl p-4">
                                <h3 className="text-white font-bold text-sm mb-2">Contact Details</h3>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    Your phone number and physical address should remain current so that management can reach you or mail necessary documents safely.
                                </p>
                            </div>
                            <div className="bg-black/50 border border-zinc-800 rounded-xl md:col-span-2 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Settings className="w-4 h-4 text-zinc-400" />
                                    <h3 className="text-white font-bold text-sm">Avatar & Customization</h3>
                                </div>
                                <p className="text-zinc-400 text-xs leading-relaxed">
                                    Update your avatar by selecting a new photo within your profile settings. Your personalized avatar will sync dynamically alongside your name in global directories, the Top Nav bar, and your individual task cards.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
};
