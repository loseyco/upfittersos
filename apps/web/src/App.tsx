import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthProvider';
import { Login } from './features/auth/Login';
import { SuperAdminGuard } from './components/guards/SuperAdminGuard';
import { TenantGuard } from './components/guards/TenantGuard';
import { BusinessManager } from './features/super-admin/BusinessManager';
import { TenantDashboard } from './features/business/TenantDashboard';
import { UserProfilePage } from './features/users/UserProfilePage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="bottom-right" richColors theme="system" closeButton />
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Super Admin Tier */}
            <Route element={<SuperAdminGuard />}>
              <Route path="/super-admin/*" element={<BusinessManager />} />
            </Route>

            {/* Tenant Tier */}
            <Route element={<TenantGuard />}>
               <Route path="/business/:tenantId/*" element={<TenantDashboard />} />
               <Route path="/business/:tenantId/profile" element={<UserProfilePage />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
