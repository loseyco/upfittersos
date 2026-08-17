import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase/config';
import { UnifiedMonitor } from './UnifiedMonitor';

export function UnifiedMonitorAuthWrapper() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get('t') || localStorage.getItem('tv_paired_tenant_id') || 'loseyco';
    const email = searchParams.get('u');
    const password = searchParams.get('p');
    const monitorId = searchParams.get('m') || searchParams.get('monitorId');

    if (monitorId) {
      localStorage.setItem('bound_monitor_id', monitorId);
    }

    setTenantId(t);
    localStorage.setItem('tv_paired_tenant_id', t);

    if (email && password) {
      signInWithEmailAndPassword(auth, email, password)
        .then(() => setIsAuthenticated(true))
        .catch((err: any) => {
          console.error('Unified TV login failed:', err);
          setError(`Authentication failed: ${err.message}`);
        });
    } else {
      // Check if already authenticated or wait for Firebase auth to initialize
      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
          setIsAuthenticated(true);
        } else {
          // If monitorId or bound_monitor_id exists, allow public shop view
          const bound = monitorId || localStorage.getItem('bound_monitor_id');
          if (bound) {
            setIsAuthenticated(true);
          } else {
            setError('Missing parameters. URL must include ?t=tenantId&u=email&p=password or be paired first.');
          }
        }
      });
      return () => unsubscribe();
    }
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8 font-sans">
        <div className="bg-red-950/50 border border-red-900 rounded-2xl p-8 max-w-2xl w-full text-center">
          <h2 className="text-2xl font-black text-red-500 mb-4 tracking-tight">TV DISPLAY ERROR</h2>
          <p className="text-red-200 font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !tenantId) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 border-4 border-zinc-800 border-t-white rounded-full animate-spin mb-6"></div>
        <div className="text-xl font-bold tracking-widest uppercase text-zinc-500 animate-pulse">Initializing Monitor...</div>
      </div>
    );
  }

  return <UnifiedMonitor tenantId={tenantId} />;
}
