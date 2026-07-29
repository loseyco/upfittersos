import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { useAuthStore } from './store';
import { collection, query, where, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { resolvePermissions, PERMISSIONS } from './permissions';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setSuperAdmin, setTenantId, setPermissions, setLoading, setMustChangePassword } = useAuthStore();

  useEffect(() => {
    let unsubStaffPermissions: (() => void) | null = null;
    let unsubDeptPermissions: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (unsubStaffPermissions) {
        unsubStaffPermissions();
        unsubStaffPermissions = null;
      }
      if (unsubDeptPermissions) {
        unsubDeptPermissions();
        unsubDeptPermissions = null;
      }
      
      if (user) {
        // Fetch user profile first to check mustChangePassword
        let mustChange = false;
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          mustChange = userDoc.exists() && userDoc.data().mustChangePassword === true;
        } catch (e) {
          console.error("Error checking user profile", e);
        }
        setMustChangePassword(mustChange);

        // Check if user is super admin in system_admins collection
        try {
          const isHardcodedSuper = user.email?.toLowerCase() === 'p.losey@saegrp.com' || user.email?.toLowerCase() === 'loseyp@gmail.com';
          let isSuper = isHardcodedSuper;
          
          if (!isSuper) {
            const adminDoc = await getDoc(doc(db, 'system_admins', user.uid)).catch(() => null);
            isSuper = !!adminDoc?.exists();
          }

          setSuperAdmin(isSuper);
          if (isSuper) {
            const allPerms = Object.keys(PERMISSIONS).reduce((acc, key) => ({ ...acc, [key]: true }), {});
            setPermissions(allPerms);
          }
        } catch (e) {
          setSuperAdmin(false);
        }

        // Fetch tenant ID from claims or user document
        let currentTenantId: string | null = null;
        try {
          const token = await user.getIdTokenResult();
          currentTenantId = (token.claims?.tenantId as string) || null;
          setTenantId(currentTenantId);

          if (currentTenantId) {
            // Real-time listener for staff permissions
            const staffQuery = query(
              collection(db, `businesses/${currentTenantId}/staff`),
              where('email', '==', user.email?.toLowerCase())
            );
            
            unsubStaffPermissions = onSnapshot(staffQuery, (staffSnap) => {
              if (unsubDeptPermissions) {
                unsubDeptPermissions();
                unsubDeptPermissions = null;
              }

              if (!staffSnap.empty) {
                const staffData = staffSnap.docs[0].data();
                const indPerms = staffData.individualPermissions || staffData.permissions || {};
                
                if (staffData.departmentId) {
                  // Real-time listener for Department defaults
                  const deptRef = doc(db, `businesses/${currentTenantId}/departments`, staffData.departmentId);
                  unsubDeptPermissions = onSnapshot(deptRef, (deptDoc) => {
                    const deptPermissions = deptDoc.exists() ? (deptDoc.data().permissions || {}) : {};
                    const resolved = resolvePermissions(deptPermissions, indPerms);

                    if (user.email?.toLowerCase() === 'p.losey@saegrp.com') {
                      const allPerms = Object.keys(PERMISSIONS).reduce((acc, key) => ({ ...acc, [key]: true }), {});
                      setPermissions(allPerms);
                    } else {
                      setPermissions(resolved);
                    }
                  });
                } else {
                  const resolved = resolvePermissions({}, indPerms);
                  if (user.email?.toLowerCase() === 'p.losey@saegrp.com') {
                    const allPerms = Object.keys(PERMISSIONS).reduce((acc, key) => ({ ...acc, [key]: true }), {});
                    setPermissions(allPerms);
                  } else {
                    setPermissions(resolved);
                  }
                }
              } else {
                setPermissions({});
              }
            });
          }
        } catch (e) {
          console.error("Error fetching permissions", e);
          setTenantId(null);
          setPermissions({});
        }
      } else {
        setSuperAdmin(false);
        setTenantId(null);
        setPermissions({});
        setMustChangePassword(false);
      }
      
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubStaffPermissions) unsubStaffPermissions();
      if (unsubDeptPermissions) unsubDeptPermissions();
    };
  }, []);

  return <>{children}</>;
}
