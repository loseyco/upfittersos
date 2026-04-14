import { useState } from 'react';
import { ShieldCheck, AlertCircle, Chrome, Mail, Lock, ArrowRight, KeyRound } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';

export function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<'email' | 'password' | 'setup_sent'>('email');
    const [providers, setProviders] = useState<string[]>([]);

    const navigate = useNavigate();
    const { signInWithGoogle } = useAuth();

    // Handle Google Workspace Auth (B2B / Internal)
    const handleGoogleSSOSignIn = async () => {
        try {
            setError('');
            setLoading(true);
            const userCredential = await signInWithGoogle();
            const idTokenResult = await userCredential.user.getIdTokenResult();
            const tenantId = idTokenResult.claims.tenantId;
            const role = idTokenResult.claims.role;
            
            if (role === 'system_owner' || role === 'super_admin') {
                navigate('/admin');
            } else if (tenantId && tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
                navigate('/dashboard');
            } else {
                navigate('/profile');
            }
        } catch (err: any) {
            console.error("Google Auth Error:", err);
            if (err.code === 'auth/popup-closed-by-user') {
                setError('Sign-in popup was closed before completion. Please click the Google button to try again.');
            } else {
                setError(err.message || 'Failed to authenticate with Google Workspace.');
            }
        } finally {
            setLoading(false);
        }
    }

    // 1. Intercept the email to resolve the identity on the backend
    const handleEmailLookup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setError('');
        setLoading(true);

        // Fast-path automatic SSO for internal corporate domains
        if (email.toLowerCase().endsWith('@saegrp.com')) {
            setProviders(['google.com']);
            setStep('password');
            await handleGoogleSSOSignIn();
            return;
        }

        try {
            const res = await api.post('/auth/check', { email });
            const { exists, status, authProviders } = res.data;

            if (authProviders) setProviders(authProviders);

            if (!exists) {
                setError('Identity not recognized. Are you sure you have an account?');
            } else if (status === 'provisioned') {
                // Intercept the user natively and inherently trigger the password setup
                await sendPasswordResetEmail(auth, email);
                setStep('setup_sent');
            } else {
                // Normal login flow
                setStep('password');
                
                // UX Auto-trigger for pure Google Workspace identities
                if (authProviders && authProviders.includes('google.com') && !authProviders.includes('password')) {
                    await handleGoogleSSOSignIn();
                }
            }
        } catch (err: any) {
            console.error("Lookup failed", err);
            setError('Failed to resolve network identity.');
        } finally {
            setLoading(false);
        }
    };

    // 2. Handle Standard Email/Password B2C Users (Step 2)
    const handleStandardSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setError('');
            setLoading(true);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const idTokenResult = await userCredential.user.getIdTokenResult();
            const tenantId = idTokenResult.claims.tenantId;
            const role = idTokenResult.claims.role;
            
            if (role === 'system_owner' || role === 'super_admin') {
                navigate('/admin');
            } else if (tenantId && tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
                navigate('/dashboard');
            } else {
                navigate('/profile');
            }
        } catch (err: any) {
            setError('Failed to sign in. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="flex-1 bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative z-10 shadow-2xl transition-all duration-300">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center shadow-inner">
                        <ShieldCheck className="w-8 h-8 text-accent" />
                    </div>
                </div>

                <h1 className="text-3xl font-black text-white text-center tracking-tight mb-2">Upfitters OS</h1>
                <p className="text-zinc-400 text-center mb-8 font-medium">Secure Operational Access</p>

                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-200 leading-relaxed">{error}</p>
                    </div>
                )}

                {step === 'setup_sent' ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center shadow-lg shadow-emerald-500/5">
                            <KeyRound className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                            <h3 className="text-xl font-black text-white mb-2">Check Your Email</h3>
                            <p className="text-sm text-emerald-200/80 mb-2 leading-relaxed font-medium">
                                A secure configuration link has been dispatched to:
                            </p>
                            <p className="text-emerald-400 font-bold mb-4">{email}</p>
                            <p className="text-xs text-zinc-400 leading-relaxed max-w-[280px] mx-auto">
                                Click the secure link in that email to configure your personal password and access your workspace.
                            </p>
                        </div>
                        <button onClick={() => setStep('email')} className="w-full text-center text-xs font-bold text-zinc-500 hover:text-white transition-colors">
                            Did not receive it? Start over
                        </button>
                    </div>
                ) : (
                    <form onSubmit={step === 'email' ? handleEmailLookup : handleStandardSubmit} className="space-y-4">
                        
                        {/* Universal Email Field */}
                        <div className={`space-y-1.5 transition-all duration-300 ${step === 'password' ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-accent focus:ring-1 focus:ring-accent rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-all disabled:opacity-50"
                                    placeholder="name@domain.com"
                                    disabled={step === 'password' || loading}
                                />
                            </div>
                            {step === 'password' && (
                                <button type="button" onClick={() => { setStep('email'); setPassword(''); }} className="text-[10px] font-bold text-accent hover:text-white transition-colors ml-1 mt-1 block">
                                    Wrong email? Change identity
                                </button>
                            )}
                        </div>

                        {/* Standard Password Field (Only if they actually use passwords) */}
                        {step === 'password' && (!providers.length || providers.includes('password')) && (
                            <>
                                <div className="space-y-1.5 transition-all animate-in fade-in slide-in-from-top-4">
                                    <div className="flex justify-between items-center ml-1">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Password</label>
                                        <Link to="/reset-password" className="text-xs font-bold text-accent hover:text-accent-hover transition-colors">Forgot?</Link>
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                        <input
                                            type="password"
                                            required
                                            autoFocus
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-800 focus:border-accent focus:ring-1 focus:ring-accent rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-all"
                                            placeholder="••••••••"
                                            disabled={loading}
                                        />
                                    </div>
                                </div>
                                
                                <div className="pt-2 animate-in fade-in slide-in-from-bottom-2">
                                    <button
                                        type="submit"
                                        disabled={loading || !password}
                                        className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg shadow-accent/20 disabled:opacity-50 mt-2 group hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        {loading ? 'Authenticating...' : 'Sign In Securely'}
                                        {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Google SSO Auto-Reroute (Only if they use Google) */}
                        {step === 'password' && providers.includes('google.com') && (
                            <div className="pt-4 pb-2 animate-in fade-in slide-in-from-bottom-4">
                                {providers.includes('password') && (
                                    <div className="my-5 flex items-center">
                                        <div className="flex-1 border-t border-zinc-800"></div>
                                        <span className="px-4 text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Or continue with</span>
                                        <div className="flex-1 border-t border-zinc-800"></div>
                                    </div>
                                )}
                                {!providers.includes('password') && (
                                    <p className="text-xs text-center text-zinc-500 mb-4 font-medium">This identity is securely managed by Google Workspace.</p>
                                )}
                                <button
                                    type="button"
                                    onClick={handleGoogleSSOSignIn}
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-200 text-zinc-950 px-4 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Chrome className="w-5 h-5" />
                                    Authenticate via Google Workspace
                                </button>
                            </div>
                        )}

                        {/* Email Continuing Action */}
                        {step === 'email' && (
                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={loading || !email}
                                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 text-zinc-950 px-4 py-3 rounded-xl font-black transition-all shadow-lg shadow-white/10 disabled:opacity-50 mt-2 group hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {loading ? 'Resolving Identity...' : 'Continue'}
                                    {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                                </button>
                            </div>
                        )}
                    </form>
                )}


            </div>
        </div>
    );
}
