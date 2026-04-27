import { create } from 'zustand';
import type { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  isSuperAdmin: boolean;
  tenantId: string | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setSuperAdmin: (isSuperAdmin: boolean) => void;
  setTenantId: (tenantId: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isSuperAdmin: false,
  tenantId: null,
  loading: true,
  setUser: (user) => set({ user }),
  setSuperAdmin: (isSuperAdmin) => set({ isSuperAdmin }),
  setTenantId: (tenantId) => set({ tenantId }),
  setLoading: (loading) => set({ loading }),
}));
