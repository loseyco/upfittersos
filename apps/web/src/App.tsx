import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthProvider';
import { AnalyticsProvider } from './lib/analytics/AnalyticsProvider';
import { Login } from './features/auth/Login';
import { SuperAdminGuard } from './components/guards/SuperAdminGuard';
import { TenantGuard } from './components/guards/TenantGuard';
import { BusinessManager } from './features/super-admin/BusinessManager';
import { TenantDashboard } from './features/business/TenantDashboard';
import { UserProfilePage } from './features/users/UserProfilePage';
import { BayMonitorAuthWrapper } from './features/business/BayMonitorAuthWrapper';
import { ParkingMonitorAuthWrapper } from './features/business/ParkingMonitorAuthWrapper';
import { TimeclockMonitorAuthWrapper } from './features/business/TimeclockMonitorAuthWrapper';
import { ConferenceRoomMonitorAuthWrapper } from './features/business/ConferenceRoomMonitorAuthWrapper';
import { UnifiedMonitorAuthWrapper } from './features/business/UnifiedMonitorAuthWrapper';
import { TvSetupScreen } from './features/business/TvSetupScreen';
import { TvPairingApprove } from './features/business/TvPairingApprove';
import { QRRedirector } from './features/business/QRRedirector';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ReloadPrompt } from './components/ReloadPrompt';
import { FeedbackWidget } from './components/FeedbackWidget';
import { DebugPortal } from './components/super-admin/DebugPortal';
import { FeedbackReports } from './features/super-admin/FeedbackReports';
import { PermissionMatrixPortal } from './features/super-admin/PermissionMatrixPortal';
import { GlobalWakeLock } from './components/telemetry/GlobalWakeLock';
import { FCMListener } from './components/FCMListener';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster 
        position="top-right" 
        richColors 
        theme="system" 
        closeButton 
        expand={true} 
      />
      <AuthProvider>
        <GlobalWakeLock />
        <FCMListener />
        <ReloadPrompt />
        <Router>
          <AnalyticsProvider>
            <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/tv" element={<BayMonitorAuthWrapper />} />
            <Route path="/parking-tv" element={<ParkingMonitorAuthWrapper />} />
            <Route path="/timeclock-tv" element={<TimeclockMonitorAuthWrapper />} />
            <Route path="/conference-tv" element={<ConferenceRoomMonitorAuthWrapper />} />
            <Route path="/monitor-tv" element={<UnifiedMonitorAuthWrapper />} />
            <Route path="/tv-setup" element={<TvSetupScreen />} />
            <Route path="/pair" element={<TvPairingApprove />} />
            <Route path="/qr" element={<QRRedirector />} />
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Super Admin Tier */}
            <Route element={<SuperAdminGuard />}>
              <Route path="/super-admin/feedback" element={<FeedbackReports />} />
              <Route path="/super-admin/permissions" element={<PermissionMatrixPortal tenantId="loseyco" />} />
              <Route path="/super-admin/*" element={<BusinessManager />} />
            </Route>

            {/* Tenant Tier */}
            <Route element={<TenantGuard />}>
               <Route path="/business/:tenantId/*" element={<TenantDashboard />} />
               <Route path="/business/:tenantId/profile" element={<UserProfilePage />} />
            </Route>
            </Routes>
            <FeedbackWidget />
            <DebugPortal />
          </AnalyticsProvider>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
