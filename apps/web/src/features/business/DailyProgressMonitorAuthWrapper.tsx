import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase/config';
import { DailyProgressMonitor } from './DailyProgressMonitor';

export function DailyProgressMonitorAuthWrapper() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get('t') || localStorage.getItem('tv_paired_tenant_id') || 'loseyco';
    const email = searchParams.get('u');
    const password = searchParams.get('p');

    setTenantId(t);
    localStorage.setItem('tv_paired_tenant_id', t);

    if (email && password) {
      signInWithEmailAndPassword(auth, email, password)
        .then(() => setIsAuthenticated(true))
        .catch((err: any) => {
          console.error('Daily Progress TV login failed:', err);
          setError(`Authentication failed: ${err.message}`);
        });
    } else {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
          setIsAuthenticated(true);
        } else {
          // Allow public shop view
          setIsAuthenticated(true);
        }
      });
      return () => unsubscribe();
    }
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8 font-sans">
        <div className="bg-red-950/50 border border-red-900 rounded-2xl p-8 max-w-2xl w-full text-center">
          <h2 className="text-2xl font-black text-red-500 mb-4 tracking-tight">DAILY PROGRESS TV DISPLAY ERROR</h2>
          <p className="text-red-200 font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !tenantId) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
        <div className="text-xl font-bold tracking-widest uppercase text-zinc-500 animate-pulse">Initializing Daily Progress Digest...</div>
      </div>
    );
  }

  return <DailyProgressMonitor tenantId={tenantId} />;
}
