import { Terminal } from 'lucide-react';

export const ApiReferenceDoc = () => {
    return (
        <div className="animate-in fade-in h-full flex flex-col">
            <div className="mb-8">
                <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">REST API Reference</h1>
                <p className="text-zinc-400 text-lg max-w-2xl leading-relaxed">
                    The backend core for UpfitterOS is built on highly scalable, context-aware Google Cloud Functions. 
                    This interactive Swagger documentation is synchronized live with the production `api-saegrp.web.app` endpoint.
                </p>
                <div className="flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg w-auto inline-flex text-indigo-400 font-mono text-sm">
                    <Terminal className="w-4 h-4" /> Endpoint: https://api-saegrp.web.app
                </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl min-h-[600px] mb-8 relative">
                <iframe 
                    src="https://api-saegrp.web.app" 
                    title="API Documentation"
                    className="absolute inset-0 w-full h-full border-0"
                    loading="lazy"
                ></iframe>
            </div>
        </div>
    );
};
