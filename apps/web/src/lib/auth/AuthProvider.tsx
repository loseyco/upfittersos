import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { useAuthStore } from './store';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { resolvePermissions, PERMISSIONS } from './permissions';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setSuperAdmin, setTenantId, setPermissions, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (user) {
        // Enforce Rule 2: loseyp@gmail.com is hardcoded as root platform operator
        if (user.email?.toLowerCase() === 'loseyp@gmail.com') {
          setSuperAdmin(true);
          setTenantId('GLOBAL');
          // Super admin gets all permissions
          setPermissions({}); // Logical check will handle GLOBAL/SuperAdmin
        } else {
          setSuperAdmin(false);
          let currentTenantId = null;
          try {
            const token = await user.getIdTokenResult();
            currentTenantId = (token.claims?.tenantId as string) || null;
            setTenantId(currentTenantId);

            if (currentTenantId) {
              // Fetch staff permissions
              const staffQuery = query(
                collection(db, `businesses/${currentTenantId}/staff`),
                where('email', '==', user.email?.toLowerCase())
              );
              const staffSnap = await getDocs(staffQuery);
              
              if (!staffSnap.empty) {
                const staffData = staffSnap.docs[0].data();
                let deptPermissions = {};
                
                if (staffData.departmentId) {
                  const deptDoc = await getDoc(doc(db, `businesses/${currentTenantId}/departments`, staffData.departmentId));
                  if (deptDoc.exists()) {
                    deptPermissions = deptDoc.data().permissions || {};
                  }
                }
                
                const resolved = resolvePermissions(deptPermissions, staffData.individualPermissions);
                
                // Grant full tenant permissions to p.losey@saegrp.com
                if (user.email?.toLowerCase() === 'p.losey@saegrp.com') {
                  const allPerms = Object.keys(PERMISSIONS).reduce((acc, key) => ({ ...acc, [key]: true }), {});
                  setPermissions(allPerms);
                } else {
                  setPermissions(resolved);
                }
              } else {
                setPermissions({});
              }
            }
          } catch (e) {
            console.error("Error fetching permissions", e);
            setTenantId(null);
            setPermissions({});
          }
        }
      } else {
        setSuperAdmin(false);
        setTenantId(null);
        setPermissions({});
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setSuperAdmin, setTenantId, setPermissions, setLoading]);

  return <>{children}</>;
}
