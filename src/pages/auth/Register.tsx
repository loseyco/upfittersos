import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Register() {    return (
        <div className="flex-1 bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative z-10 shadow-2xl">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center shadow-inner">
                        <ShieldCheck className="w-8 h-8 text-accent" />
                    </div>
                </div>

                <h1 className="text-3xl font-black text-white text-center tracking-tight mb-2">Request Access</h1>
                <p className="text-zinc-400 text-center mb-8 font-medium">Create a new SAE OS identity</p>



                <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-6 text-center shadow-inner my-6">
                    <ShieldCheck className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">Registration Disabled</h3>
                    <p className="text-sm text-zinc-400 font-medium">Self-service registration is currently deactivated. Please contact your system administrator to request an invitation to the platform.</p>
                </div>

                <p className="mt-8 text-center text-sm text-zinc-500 font-medium">
                    Already have an account? <Link to="/login" className="text-white hover:text-accent transition-colors font-bold">Sign In</Link>
                </p>
            </div>
        </div>
    );
}
