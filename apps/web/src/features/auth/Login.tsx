import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../../lib/firebase/config';
import { submitAuditLog } from '../../lib/logging/audit';
import { ShieldCheck } from 'lucide-react';
import { usePageTitle } from '../../lib/hooks/usePageTitle';

export function Login() {
  usePageTitle('Login');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const creds = await signInWithEmailAndPassword(auth, email, password);
      if (creds.user.email === 'loseyp@gmail.com') {
        submitAuditLog('GLOBAL', { userId: creds.user.uid, actionType: 'LOGIN', details: { method: 'password' } });
        navigate('/super-admin');
      } else {
        const token = await creds.user.getIdTokenResult();
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
      if (creds.user.email === 'loseyp@gmail.com') {
        submitAuditLog('GLOBAL', { userId: creds.user.uid, actionType: 'LOGIN', details: { method: 'google.com' } });
        navigate('/super-admin');
      } else {
        const token = await creds.user.getIdTokenResult();
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

        <div className="bg-white/80 dark:bg-zinc-900/50 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-3xl p-8 shadow-2xl transition-colors">
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
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ml-1 transition-colors">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                placeholder="loseyp@gmail.com"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider ml-1 transition-colors">Password</label>
              <input
                type="password"
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
        </div>
      </div>
    </div>
  );
}
