import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthProvider';
import { AnalyticsProvider } from './lib/analytics/AnalyticsProvider';
import { Login } from './features/auth/Login';
import { SuperAdminGuard } from './components/guards/SuperAdminGuard';
import { TenantGuard } from './components/guards/TenantGuard';
import { BusinessManager } from './features/super-admin/BusinessManager';
import { TenantDashboard } from './features/business/TenantDashboard';
import { UserProfilePage } from './features/users/UserProfilePage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ReloadPrompt } from './components/ReloadPrompt';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="bottom-right" richColors theme="system" closeButton />
      <AuthProvider>
        <ReloadPrompt />
        <Router>
          <AnalyticsProvider>
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
          </AnalyticsProvider>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
