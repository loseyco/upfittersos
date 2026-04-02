import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { ShieldCheck, Lock, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function AuthAction() {
    const [searchParams] = useSearchParams();
    const mode = searchParams.get('mode');
    const oobCode = searchParams.get('oobCode');

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [email, setEmail] = useState('');

    useEffect(() => {
        if (!oobCode || mode !== 'resetPassword') {
            setError('Invalid or expired configuration link.');
            setVerifying(false);
            return;
        }

        // Verify the code before letting them set a password
        verifyPasswordResetCode(auth, oobCode)
            .then((linkedEmail) => {
                setEmail(linkedEmail);
                setVerifying(false);
            })
            .catch((err) => {
                console.error("Action Code Error:", err);
                setError('This setup link has expired or is invalid. Please request a new one.');
                setVerifying(false);
            });
    }, [oobCode, mode]);

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!oobCode) return;
        
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        try {
            setError('');
            setLoading(true);
            await confirmPasswordReset(auth, oobCode, newPassword);
            setSuccess(true);
            toast.success("Security credentials updated successfully.");
        } catch (err: any) {
            console.error(err);
            setError("Failed to secure identity. The link may have expired.");
        } finally {
            setLoading(false);
        }
    };

    if (verifying) {
        return (
            <div className="flex-1 bg-zinc-950 flex flex-col justify-center items-center text-white">
                <ShieldCheck className="w-12 h-12 text-zinc-800 animate-pulse mb-4" />
                <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Verifying Identity Token...</p>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative z-10 shadow-2xl">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center shadow-inner">
                        <Lock className="w-8 h-8 text-accent" />
                    </div>
                </div>

                <h1 className="text-3xl font-black text-white text-center tracking-tight mb-2">Configure Access</h1>
                <p className="text-zinc-400 text-center mb-8 font-medium">Set a permanent password for <span className="text-white">{email}</span></p>

                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-200">{error}</p>
                    </div>
                )}

                {success ? (
                    <div className="space-y-6">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center shadow-lg">
                            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                            <h3 className="text-lg font-black text-white mb-2">Identity Secured</h3>
                            <p className="text-sm text-emerald-200/80 mb-4 leading-relaxed font-medium">
                                Your network credentials have been successfully established. You can now access your workspace.
                            </p>
                        </div>
                        <Link to="/login" className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded-xl font-black transition-all shadow-lg active:scale-95 group">
                            Sign In to Network Access
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                ) : (
                    mode === 'resetPassword' && !error && (
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">New Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                    <input
                                        type="password"
                                        required
                                        autoFocus
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-accent focus:ring-1 focus:ring-accent rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-all"
                                        placeholder="Min. 8 characters"
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Confirm Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                    <input
                                        type="password"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-accent focus:ring-1 focus:ring-accent rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-all"
                                        placeholder="Confirm new password"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !newPassword || !confirmPassword}
                                className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg shadow-accent/20 disabled:opacity-50 mt-4 group hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {loading ? 'Securing...' : 'Establish Credentials'}
                                {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                            </button>
                        </form>
                    )
                )}
            </div>
        </div>
    );
}
