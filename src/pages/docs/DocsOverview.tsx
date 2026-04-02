import { Terminal, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '../../lib/constants';

export const DocsOverview = () => {
    return (
        <div className="animate-in fade-in max-w-3xl">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">{APP_NAME} Documentation</h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
                Welcome to the definitive source of truth for the {APP_NAME} ecosystem. This hub contains both public-facing API references and internal operational protocols.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Link to="/documents/api" className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <Terminal className="w-6 h-6 text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">REST API Reference</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Interactive OpenAPI specifications for the active Google Cloud Functions routing backend.
                    </p>
                </Link>

                <Link to="/documents/hardware" className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/80 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-6 group-hover:scale-110 transition-transform">
                        <QrCode className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">QR Hardware Strategy</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        The physical master blueprint governing multi-tenant vanity domains, bulk tag generation, and fault tolerance.
                    </p>
                </Link>
            </div>
        </div>
    );
};
