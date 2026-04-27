import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';

export function SuperAdminGuard() {
  const { user, isSuperAdmin, loading } = useAuthStore();

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">Loading OS...</div>;

  if (!user || !isSuperAdmin) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
