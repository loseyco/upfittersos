import { Outlet, Link, useLocation } from 'react-router-dom';
import { Globe, Map, Wrench, Activity, PieChart, QrCode, LogOut, User, ClipboardList, Eye, CalendarDays } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function MainLayout() {
    const location = useLocation();
    const { currentUser, logout } = useAuth();

    const mobileNavItems = [
        { path: '/', icon: Globe, label: 'Public' },
        { path: '/guide', icon: Map, label: 'Guide' },
        { path: '/tech', icon: Wrench, label: 'Tech' },
        { path: '/ops', icon: Activity, label: 'Ops' },
        { path: '/sales', icon: PieChart, label: 'Sales' },
        { path: '/logs', icon: ClipboardList, label: 'Logs' },
        { path: '/meetings', icon: CalendarDays, label: 'Meetings' },
        { path: '/vision', icon: Eye, label: 'Vision' },
        { path: '/customer/demo', icon: User, label: 'Portal' },
    ];

    return (
        <div className="min-h-screen flex flex-col w-full overflow-x-hidden relative">


            {/* Top Header */}
            <header className="bg-zinc-900 border-b border-zinc-800 p-3 md:p-4 shrink-0 flex items-center justify-between z-50">
                <div className="flex items-center gap-2 md:gap-4">
                    <h1 className="tour-logo text-lg md:text-xl font-bold tracking-tight text-white shrink-0">SAE OS</h1>
                    <nav className="hidden md:flex items-center gap-6 ml-8">
                        <Link to="/" className={`text-sm font-medium transition-colors ${location.pathname === '/' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Public Site</Link>
                        <Link to="/guide" className={`text-sm font-medium transition-colors ${location.pathname === '/guide' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Platform Guide</Link>
                        
                        <Link to="/tech" className={`text-sm font-medium transition-colors ${location.pathname === '/tech' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Tech Portal</Link>
                        <Link to="/ops" className={`text-sm font-medium transition-colors ${location.pathname === '/ops' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Ops Command</Link>
                        <Link to="/sales" className={`text-sm font-medium transition-colors ${location.pathname === '/sales' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Sales Engine</Link>
                        <Link to="/logs" className={`text-sm font-medium transition-colors ${location.pathname === '/logs' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Daily Logs</Link>
                        <Link to="/meetings" className={`text-sm font-medium transition-colors ${location.pathname === '/meetings' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Meetings</Link>
                        <Link to="/vision" className={`text-sm font-bold transition-colors ${location.pathname === '/vision' ? 'text-accent' : 'text-purple-400 hover:text-accent drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]'}`}>Vision 🚀</Link>
                        <Link to="/customer/demo" className={`text-sm font-bold transition-colors ${location.pathname === '/customer/demo' ? 'text-emerald-400' : 'text-emerald-500/70 hover:text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]'}`}>Customer Portal</Link>
                    </nav>
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                    <Link to="/jobs/mock" className="flex items-center justify-center h-8 w-8 bg-zinc-800 text-zinc-400 rounded-md hover:bg-zinc-700 hover:text-white transition-colors border border-zinc-700" title="Mock QR Scan">
                        <QrCode className="w-4 h-4" />
                    </Link>

                    {currentUser ? (
                        <div className="flex items-center gap-3 ml-2 border-l border-zinc-800 pl-4">
                            <Link to="/profile" className="flex items-center gap-3 hover:bg-zinc-800/50 p-1.5 rounded-lg transition-colors cursor-pointer" title="View HR Profile">
                                <div className="hidden lg:flex flex-col items-end">
                                    <span className="text-sm font-bold text-white leading-none">{currentUser.displayName || 'Authorized User'}</span>
                                    <span className="text-[10px] text-zinc-500 font-medium">{currentUser.email}</span>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold border border-accent/30 shrink-0">
                                    {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : <User className="w-4 h-4" />}
                                </div>
                            </Link>
                            <button
                                onClick={() => logout()}
                                className="ml-1 p-2 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Sign Out"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <Link
                            to="/login"
                            className="ml-2 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-lg transition-colors shadow"
                        >
                            Sign In
                        </Link>
                    )}
                </div>
            </header>

            {/* Main Content Area (padding bottom on mobile for tab bar) */}
            <main className="flex-1 flex flex-col relative overflow-y-auto w-full pb-[72px] md:pb-0">
                <Outlet />
            </main>

            {/* Mobile Bottom Tab Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
                <nav className="flex items-center overflow-x-auto overflow-y-hidden touch-pan-x flex-nowrap snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-2 py-2 pb-safe w-full">
                    {mobileNavItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex flex-col items-center justify-center min-w-[76px] w-[76px] snap-center py-1.5 gap-1 transition-colors shrink-0 ${isActive ? 'text-accent' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                <item.icon className="w-5 h-5" />
                                <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
