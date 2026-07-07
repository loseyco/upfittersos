import { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, updatePassword } from 'firebase/auth';
import { auth, db } from '../../lib/firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { submitAuditLog } from '../../lib/logging/audit';
import { ShieldCheck, ArrowLeft, KeyRound, CheckCircle2 } from 'lucide-react';
import { usePageTitle } from '../../lib/hooks/usePageTitle';

export function Login() {
  usePageTitle('Login');
  const navigate = useNavigate();
  const { user, isSuperAdmin, tenantId, loading: authLoading, setMustChangePassword } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Password reset states
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Force reset states
  const [isForceChangeMode, setIsForceChangeMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const checkRedirect = async () => {
      if (!authLoading && user) {
        // Direct query to Firestore to avoid race condition on user auth state change
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().mustChangePassword === true) {
            setIsForceChangeMode(true);
            setMustChangePassword(true);
            return;
          }
        } catch (e) {
          console.error("Error checking password requirement:", e);
        }

        const pendingRedirect = localStorage.getItem('pendingQrRedirect');
        if (pendingRedirect) {
          localStorage.removeItem('pendingQrRedirect');
          navigate(pendingRedirect);
        } else if (isSuperAdmin) {
          navigate('/super-admin');
        } else if (tenantId) {
          navigate(`/business/${tenantId}`);
        }
      }
    };

    checkRedirect();
  }, [user, isSuperAdmin, tenantId, authLoading, navigate, setMustChangePassword]);

  if (authLoading) return null;

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const submittedEmail = (formData.get('email') as string || email).trim();
    const submittedPassword = formData.get('password') as string || password;

    try {
      const creds = await signInWithEmailAndPassword(auth, submittedEmail, submittedPassword);
      
      // Immediately check if password change is forced
      const userDocRef = doc(db, 'users', creds.user.uid);
      const userDoc = await getDoc(userDocRef);
      const mustChange = userDoc.exists() && userDoc.data().mustChangePassword === true;
      
      if (mustChange) {
        setMustChangePassword(true);
        setIsForceChangeMode(true);
        setLoading(false);
        return; // Halt and show force password reset UI
      }

      if (creds.user.email?.toLowerCase() === 'loseyp@gmail.com') {
        submitAuditLog('GLOBAL', { userId: creds.user.uid, actionType: 'LOGIN', details: { method: 'password' } });
        navigate('/super-admin');
      } else {
        const token = await creds.user.getIdTokenResult(true);
        if (token.claims?.tenantId) {
          submitAuditLog(token.claims.tenantId as string, { userId: creds.user.uid, actionType: 'LOGIN', details: { method: 'password' } });
          navigate(`/business/${token.claims.tenantId}`);
        } else {
          setError('Account has no business assigned, or missing claims.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      const creds = await signInWithPopup(auth, provider);

      // If Google sign-in is used, we automatically clear any forced password reset
      // because Google provides direct authentication.
      const userDocRef = doc(db, 'users', creds.user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists() && userDoc.data().mustChangePassword === true) {
        await updateDoc(userDocRef, { mustChangePassword: false });
        setMustChangePassword(false);
      }

      if (creds.user.email?.toLowerCase() === 'loseyp@gmail.com') {
        submitAuditLog('GLOBAL', { userId: creds.user.uid, actionType: 'LOGIN', details: { method: 'google.com' } });
        navigate('/super-admin');
      } else {
        const token = await creds.user.getIdTokenResult(true);
        if (token.claims?.tenantId) {
          submitAuditLog(token.claims.tenantId as string, { userId: creds.user.uid, actionType: 'LOGIN', details: { method: 'google.com' } });
          navigate(`/business/${token.claims.tenantId}`);
        } else {
          setError('Account has no business assigned, or missing claims.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Google Auth Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim());
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleForceChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setChangingPassword(true);
    setError('');
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        
        // Update user profile document in Firestore
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userDocRef, { mustChangePassword: false });
        setMustChangePassword(false);

        // Redirect
        if (isSuperAdmin) {
          navigate('/super-admin');
        } else if (tenantId) {
          navigate(`/business/${tenantId}`);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-center items-center p-4 selection:bg-blue-500/30 transition-colors duration-300">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[150px] mix-blend-screen" />
      </div>

      <div className="relative w-full max-w-md z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-6">
            <img src="/logo.png" alt="UpFittersOS Logo" className="h-16 drop-shadow-lg" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-2 transition-colors">UpFittersOS</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm transition-colors">Standalone Shop Operating System</p>
        </div>

        <div className="bg-white/80 dark:bg-zinc-900/50 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-3xl p-8 shadow-2xl transition-colors animate-in fade-in zoom-in duration-300">
          {isForceChangeMode ? (
            <form onSubmit={handleForceChangeSubmit} className="space-y-5">
              <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-4">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <KeyRound className="w-6 h-6 text-blue-500 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Create New Password</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">First-time login security requirement</p>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="newPassword" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ml-1">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="confirmPassword" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ml-1">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={changingPassword}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 mt-4 shadow-[0_0_20px_rgba(37,99,235,0.2)]"
              >
                {changingPassword ? 'Updating Password...' : 'Save & Continue'}
              </button>
            </form>
          ) : isForgotMode ? (
            <form onSubmit={handleForgotSubmit} className="space-y-5">
              <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-4">
                <button
                  type="button"
                  onClick={() => { setIsForgotMode(false); setResetSent(false); setError(''); }}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Reset Password</h2>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {resetSent ? (
                <div className="space-y-4 py-2">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>Reset link sent! Please check your email inbox.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsForgotMode(false); setResetSent(false); setError(''); }}
                    className="w-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98]"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label htmlFor="resetEmail" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ml-1">Email Address</label>
                    <input
                      id="resetEmail"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                      placeholder="loseyp@gmail.com"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 mt-4 shadow-[0_0_20px_rgba(37,99,235,0.2)]"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </>
              )}
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-white hover:bg-gray-50 text-gray-900 font-medium py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center border border-gray-200"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Sign in with Google
              </button>

              <div className="flex items-center">
                <div className="flex-1 border-t border-zinc-200 dark:border-zinc-800 transition-colors"></div>
                <span className="px-3 text-xs text-zinc-500 uppercase tracking-wider">or email</span>
                <div className="flex-1 border-t border-zinc-200 dark:border-zinc-800 transition-colors"></div>
              </div>

              <div className="space-y-1">
                <label htmlFor="email" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ml-1 transition-colors">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="loseyp@gmail.com"
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center ml-1">
                  <label htmlFor="password" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider transition-colors">Password</label>
                  <button
                    type="button"
                    onClick={() => { setIsForgotMode(true); setError(''); }}
                    className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 mt-4 shadow-[0_0_20px_rgba(37,99,235,0.2)]"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
