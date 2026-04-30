import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';

export function TenantGuard() {
  const { user, isSuperAdmin, loading } = useAuthStore();

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">Loading OS...</div>;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Prevent SuperAdmins from accidentally using Tenant tools directly on Tier 1
  if (isSuperAdmin) {
     return <Navigate to="/super-admin" replace />;
  }

  // Ensure current user is authorized for this tenant param.
  // In a real app we check if user.tenantId === route.tenantId
  return <Outlet />;
}
