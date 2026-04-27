import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuthStore } from './store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setSuperAdmin, setTenantId, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (user) {
        // Enforce Rule 2: loseyp@gmail.com is hardcoded as root platform operator
        if (user.email === 'loseyp@gmail.com') {
          setSuperAdmin(true);
          setTenantId('GLOBAL');
        } else {
          setSuperAdmin(false);
          try {
            const token = await user.getIdTokenResult();
            setTenantId((token.claims?.tenantId as string) || null);
          } catch (e) {
            setTenantId(null);
          }
        }
      } else {
        setSuperAdmin(false);
        setTenantId(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setSuperAdmin, setTenantId, setLoading]);

  return <>{children}</>;
}
