import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Terminal, QrCode, Shield, Menu, X, ArrowLeftRight, Users, MessageSquare, History } from 'lucide-react';
import { APP_NAME } from '../../lib/constants';

export const DocsLayout = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();

    const sections = [
        {
            title: "Getting Started",
            links: [
                { path: "/documents", label: "Overview", icon: BookOpen, badge: '' },
                { path: "/documents/changelog", label: "Release Notes", icon: History, badge: '' }
            ]
        },
        {
            title: "Staff Hub",
            links: [
                { path: "/documents/staff", label: "Staff Manual", icon: Users, badge: '' },
                { path: "/documents/feedback", label: "Feedback Guide", icon: MessageSquare, badge: '' }
            ]
        },
        {
            title: "Developers",
            links: [
                { path: "/documents/api", label: "REST API Reference", icon: Terminal, badge: '' },
                { path: "/documents/integrations", label: "Ecosystem Integrations", icon: ArrowLeftRight, badge: '' }
            ]
        },
        {
            title: "Operations Protocol",
            links: [
                { path: "/documents/hardware", label: "QR Hardware Architecture", icon: QrCode, badge: '' },
                { path: "/documents/roles", label: "Security & Roles", icon: Shield, badge: '' }
            ]
        }
    ];

    return (
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-73px)] bg-black w-full text-zinc-300">
            
            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900 sticky top-0 z-40">
                <span className="font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-accent" /> Platform Documentation
                </span>
                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-zinc-800 rounded-lg text-zinc-400">
                    {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {/* Sidebar Navigation */}
            <aside className={`${isMobileMenuOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-72 lg:w-80 border-r border-zinc-800/80 bg-zinc-900/50 p-6 overscroll-contain overflow-y-auto sticky top-[73px] md:h-[calc(100vh-73px)] z-30`}>
                <div className="hidden md:flex items-center gap-3 mb-10 pb-6 border-b border-zinc-800">
                    <div className="p-2 bg-accent/20 border border-accent/30 rounded-lg">
                        <BookOpen className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                        <h2 className="text-white font-bold tracking-tight leading-none">Developer Docs</h2>
                        <span className="text-xs text-zinc-500 font-mono">v1.2.0 • Source of Truth</span>
                    </div>
                </div>

                <nav className="space-y-8 flex-1">
                    {sections.map((section, idx) => (
                        <div key={idx}>
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{section.title}</h3>
                            <ul className="space-y-1">
                                {section.links.map((link) => {
                                    const isActive = location.pathname === link.path || (link.path === '/documents' && location.pathname === '/documents/');
                                    return (
                                        <li key={link.path}>
                                            <NavLink 
                                                to={link.path}
                                                onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-colors font-medium text-sm ${isActive ? 'bg-accent/10 text-accent font-bold' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <link.icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-zinc-500'}`} />
                                                    {link.label}
                                                </div>
                                                {link.badge && (
                                                    <span className="text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{link.badge}</span>
                                                )}
                                            </NavLink>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Main Content Pane */}
            <main className="flex-1 w-full bg-black relative">
                <div className="max-w-4xl mx-auto w-full p-6 md:p-12 lg:p-16 h-full min-h-full">
                    {/* Alpha Warning Banner */}
                    <div className="mb-8 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
                        <Shield className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-orange-400 font-bold text-sm">Alpha Environment</h4>
                            <p className="text-orange-400/80 text-xs mt-1">
                                {APP_NAME} is currently in Alpha. Features are actively being developed, and this documentation is subject to change.
                            </p>
                        </div>
                    </div>

                    <Outlet />
                </div>
            </main>

        </div>
    );
};
