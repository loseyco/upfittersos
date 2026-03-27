import { useState } from 'react';
import { ShieldCheck, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export function ResetPassword() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setError('');
            setLoading(true);
            await sendPasswordResetEmail(auth, email);
            setSuccess(true);
        } catch (err: any) {
            setError('Failed to send reset email. Verify your address.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative z-10 shadow-2xl">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center shadow-inner">
                        <ShieldCheck className="w-8 h-8 text-accent" />
                    </div>
                </div>

                <h1 className="text-3xl font-black text-white text-center tracking-tight mb-2">Reset Password</h1>
                <p className="text-zinc-400 text-center mb-8 font-medium">We'll send you a recovery link</p>

                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-200">{error}</p>
                    </div>
                )}

                {success && (
                    <div className="mb-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-emerald-200 font-medium tracking-wide">Recovery email sent successfully. Check your inbox and follow the instructions to reset your password.</p>
                    </div>
                )}

                {!success && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Account Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-accent focus:ring-1 focus:ring-accent rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-all"
                                    placeholder="name@saegrp.com"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg shadow-accent/20 disabled:opacity-50 mt-4 group"
                        >
                            {loading ? 'Sending...' : 'Send Recovery Email'}
                            {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </form>
                )}

                <p className="mt-8 text-center text-sm text-zinc-500 font-medium">
                    Remember your password? <Link to="/login" className="text-white hover:text-accent transition-colors font-bold">Sign In</Link>
                </p>
            </div>
        </div>
    );
}
