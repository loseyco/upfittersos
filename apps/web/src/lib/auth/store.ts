import { create } from 'zustand';
import type { User } from 'firebase/auth';

import type { PermissionSet } from './permissions';
interface AuthState {
  user: User | null;
  isSuperAdmin: boolean;
  tenantId: string | null;
  permissions: PermissionSet;
  loading: boolean;
  setUser: (user: User | null) => void;
  setSuperAdmin: (isSuperAdmin: boolean) => void;
  setTenantId: (tenantId: string | null) => void;
  setPermissions: (permissions: PermissionSet) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isSuperAdmin: false,
  tenantId: null,
  permissions: {},
  loading: true,
  setUser: (user) => set({ user }),
  setSuperAdmin: (isSuperAdmin) => set({ isSuperAdmin }),
  setTenantId: (tenantId) => set({ tenantId }),
  setPermissions: (permissions) => set({ permissions }),
  setLoading: (loading) => set({ loading }),
}));
