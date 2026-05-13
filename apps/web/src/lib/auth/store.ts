import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type { PermissionSet } from './permissions';

interface AuthState {
  user: User | null;
  isSuperAdmin: boolean;
  tenantId: string | null;
  permissions: PermissionSet;
  loading: boolean;
  
  // Impersonation state
  impersonatedStaff: { id: string; name: string; permissions: PermissionSet; type: 'staff' | 'role' } | null;
  originalPermissions: PermissionSet | null;
  originalIsSuperAdmin: boolean | null;

  setUser: (user: User | null) => void;
  setSuperAdmin: (isSuperAdmin: boolean) => void;
  setTenantId: (tenantId: string | null) => void;
  setPermissions: (permissions: PermissionSet) => void;
  setLoading: (loading: boolean) => void;

  // Actions
  impersonate: (staff: { id: string; name: string; permissions: PermissionSet; type: 'staff' | 'role' }) => void;
  stopImpersonating: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isSuperAdmin: false,
  tenantId: null,
  permissions: {},
  loading: true,
  
  impersonatedStaff: null,
  originalPermissions: null,
  originalIsSuperAdmin: null,

  setUser: (user) => set({ user }),
  setSuperAdmin: (isSuperAdmin) => {
    if (!get().impersonatedStaff) {
      set({ isSuperAdmin });
    } else {
      set({ originalIsSuperAdmin: isSuperAdmin });
    }
  },
  setTenantId: (tenantId) => set({ tenantId }),
  setPermissions: (permissions) => {
    if (!get().impersonatedStaff) {
      set({ permissions });
    } else {
      set({ originalPermissions: permissions });
    }
  },
  setLoading: (loading) => set({ loading }),

  impersonate: (staff) => {
    const currentPerms = get().permissions;
    const currentSuper = get().isSuperAdmin;
    set({ 
      impersonatedStaff: staff,
      originalPermissions: currentPerms,
      originalIsSuperAdmin: currentSuper,
      permissions: staff.permissions,
      isSuperAdmin: false // View strictly as the staff member/role
    });
  },

  stopImpersonating: () => {
    const originalPerms = get().originalPermissions;
    const originalSuper = get().originalIsSuperAdmin;
    set({ 
      impersonatedStaff: null,
      originalPermissions: null,
      originalIsSuperAdmin: null,
      permissions: originalPerms || {},
      isSuperAdmin: originalSuper || false
    });
  }
}));
