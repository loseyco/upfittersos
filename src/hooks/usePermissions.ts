import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { DEFAULT_PERMISSIONS, type PermissionKey } from '../lib/permissions';

export function usePermissions(overrideTenantId?: string) {
    const { currentUser, role, roles, simulatedRole, tenantId: authTenantId } = useAuth();
    const activeTenantId = overrideTenantId || authTenantId;
    const [customPermissions, setCustomPermissions] = useState<Partial<Record<PermissionKey, boolean>>>({});
    const [businessRoles, setBusinessRoles] = useState<Record<string, { label: string, permissions: Partial<Record<PermissionKey, boolean>> }>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        if (!currentUser) {
            setCustomPermissions({});
            setBusinessRoles({});
            setLoading(false);
            return;
        }

        const promises = [api.get('/users/me')];
        if (activeTenantId && activeTenantId !== 'GLOBAL') {
            promises.push(api.get(`/businesses/${activeTenantId}`));
        }

        Promise.all(promises)
            .then((results) => {
                const userRes = results[0];
                const businessRes = results.length > 1 ? results[1] : null;
                if (isMounted) {
                    setCustomPermissions(userRes.data?.customPermissions || {});
                    if (businessRes) {
                        setBusinessRoles(businessRes.data?.customRoles || {});
                    }
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error("Failed to fetch custom permissions or roles", err);
                if (isMounted) setLoading(false);
            });

        return () => { isMounted = false; };
    }, [currentUser, activeTenantId]);

    const checkPermission = (key: PermissionKey): boolean => {
        if (!currentUser) return false;
        
        // Role Simulation intercepts mathematically
        if (simulatedRole) {
            if (businessRoles[simulatedRole] && businessRoles[simulatedRole].permissions?.[key] === true) return true;
            return false; // Lock out anything not explicitly afforded by the simulated custom role
        }
        
        if (customPermissions[key] !== undefined) {
            return customPermissions[key] as boolean;
        }

        // Construct standard roles array with backward compatibility 
        const arrayRoles = roles && roles.length > 0 ? roles : (role ? [role] : []);

        // Check if ANY role in the user's role array grants the permission
        for (const iterateRole of arrayRoles) {
            if (iterateRole === 'super_admin') return true;

            // Check dynamic tenant roles
            if (businessRoles[iterateRole] && businessRoles[iterateRole].permissions?.[key] === true) {
                return true;
            }

            // Check hardcoded static roles
            if (DEFAULT_PERMISSIONS[iterateRole]?.[key] === true) {
                return true;
            }
        }

        return false;
    };

    return { checkPermission, loading, customPermissions, businessRoles };
}
