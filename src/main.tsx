import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import { MainLayout } from './layouts/MainLayout'
import { BarcodeScanner } from './pages/BarcodeScanner';
import { UnitDashboard } from './pages/units/UnitDashboard';
import { InventoryItemView } from './pages/inventory/InventoryItemView';
import { RegisterQr } from './pages/RegisterQr';
import { DocsLayout } from './pages/docs/DocsLayout';
import { DocsOverview } from './pages/docs/DocsOverview';
import { ApiReferenceDoc } from './pages/docs/ApiReferenceDoc';
import { QrProtocolDoc } from './pages/docs/QrProtocolDoc';
import { MockJob } from './pages/MockJob';
import { SystemPitch } from './pages/SystemPitch';
import { PublicHero } from './pages/PublicHero';
import { CustomerPortal } from './pages/CustomerPortal';
import { RolesDoc } from './pages/docs/RolesDoc';
import { IntegrationsDoc } from './pages/docs/IntegrationsDoc';
import { StaffGuideDoc } from './pages/docs/StaffGuideDoc';
import { FeedbackGuideDoc } from './pages/docs/FeedbackGuideDoc';
import { ChangelogDoc } from './pages/docs/ChangelogDoc';
import { AuthProvider } from './contexts/AuthContext'
import { AnalyticsTracker } from './components/AnalyticsTracker'
import { AppUpdater } from './components/AppUpdater'
import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'
import { ResetPassword } from './pages/auth/ResetPassword'
import { AuthAction } from './pages/auth/AuthAction'
import { ProtectedRoute } from './components/ProtectedRoute'
import { GlobalAlertsSystem } from './components/GlobalAlertsSystem'
import { UserProfile } from './pages/UserProfile'
import { SuperAdminDashboard } from './pages/admin/SuperAdminDashboard'
import { FeaturesPlanner } from './pages/admin/features/FeaturesPlanner'
import { FeatureDetail } from './pages/admin/features/FeatureDetail'
import { BusinessAdminSuite } from './pages/business/BusinessAdminSuite'
import { WorkspaceHub } from './pages/business/WorkspaceHub'
import { MissionControlDashboard } from './pages/business/MissionControlDashboard'
import { Coworkers } from './pages/business/Coworkers'
import { FeedbackBoard } from './pages/business/FeedbackBoard'
import { FeedbackDetail } from './pages/business/FeedbackDetail'
import { TasksDashboard } from './pages/business/TasksDashboard'
import { AnalyticsDashboard } from './pages/business/AnalyticsDashboard'
import { FacilityMapPage } from './pages/business/FacilityMapPage'
import { FieldMapPage } from './pages/business/FieldMapPage'
import { OpsMissionControl } from './pages/business/OpsMissionControl'
import { AreaProfilePage } from './pages/business/areas/AreaProfilePage'
import { WorkflowWhiteboards } from './pages/business/WorkflowWhiteboards'
import { OAuthCallback } from './pages/business/OAuthCallback'
import { MeetingsDashboard } from './pages/business/MeetingsDashboard'
import { TimeClockApp } from './pages/business/TimeClockApp'
import { TimeclockKiosk } from './pages/business/TimeclockKiosk'
import { TechPortal } from './pages/TechPortal'
import { TechTaskWorkspace } from './pages/TechTaskWorkspace'
import { NoticesBoard } from './pages/business/NoticesBoard'
import { ReportViewerPage } from './pages/business/ReportViewerPage'
import { EstimatePrintView } from './pages/business/EstimatePrintView'
import { EstimateHub } from './pages/business/estimates/EstimateHub'
import { EstimateBuilder } from './pages/business/estimates/EstimateBuilder'
import { EstimateBuilderV2 } from './pages/business/estimates/EstimateBuilderV2'
import { Messenger } from './pages/business/Messenger'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Toaster 
        position="top-center" 
        toastOptions={{ 
            style: { background: '#18181b', color: '#fff', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '14px' },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } }
        }} 
      />
      <BrowserRouter>
        <AppUpdater />
        <GlobalAlertsSystem />
        <AnalyticsTracker />
        <Routes>
          {/* Full Screen Utility Routes without MainLayout */}
          <Route path="/business/tv" element={<ProtectedRoute><MissionControlDashboard isTvMode={true} /></ProtectedRoute>} />
          <Route path="/business/:id/kiosk" element={<ProtectedRoute><TimeclockKiosk /></ProtectedRoute>} />
          <Route path="/business/:tenantId/estimate/:jobId/print" element={<ProtectedRoute><EstimatePrintView /></ProtectedRoute>} />

          {/* Reference Demos / Public Mockups */}
          <Route path="/example/jobs/mock" element={<MockJob />} />
          <Route path="/example/ops" element={<OpsMissionControl />} />
          <Route path="/example/tech" element={<TechPortal />} />
          <Route path="/example/pitch" element={<SystemPitch />} />
          <Route path="/example/hero" element={<PublicHero />} />
          <Route path="/example/customer" element={<CustomerPortal />} />

          <Route element={<MainLayout />}>
            {/* Public Routes */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/action" element={<AuthAction />} />
            
            {/* --- Public Documentation Hub --- */}
            <Route path="/documents" element={<DocsLayout />}>
                <Route index element={<DocsOverview />} />
                <Route path="changelog" element={<ChangelogDoc />} />
                <Route path="staff" element={<StaffGuideDoc />} />
                <Route path="feedback" element={<FeedbackGuideDoc />} />
                <Route path="api" element={<ApiReferenceDoc />} />
                <Route path="integrations" element={<IntegrationsDoc />} />
                <Route path="hardware" element={<QrProtocolDoc />} />
                <Route path="roles" element={<RolesDoc />} />
            </Route>

            {/* --- Operational & Universal Tools --- */}
            <Route path="/scan" element={<ProtectedRoute><BarcodeScanner /></ProtectedRoute>} />
            <Route path="/workspace/register-qr/:id" element={<ProtectedRoute><RegisterQr /></ProtectedRoute>} />
            <Route path="/workspace/units/:id" element={<ProtectedRoute><UnitDashboard /></ProtectedRoute>} />
            <Route path="/workspace/inventory/:id" element={<ProtectedRoute><InventoryItemView /></ProtectedRoute>} />

            {/* --- Authenticated Routes --- */}
            <Route path="/workspace" element={<ProtectedRoute><WorkspaceHub /></ProtectedRoute>} />
            <Route path="/workspace/notices" element={<ProtectedRoute><NoticesBoard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute requireSuperAdmin={true}><SuperAdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/features" element={<ProtectedRoute requireSuperAdmin={true}><FeaturesPlanner /></ProtectedRoute>} />
            <Route path="/admin/features/:id" element={<ProtectedRoute requireSuperAdmin={true}><FeatureDetail /></ProtectedRoute>} />
            <Route path="/business/manage" element={<ProtectedRoute><BusinessAdminSuite /></ProtectedRoute>} />
            <Route path="/business/coworkers" element={<ProtectedRoute><Coworkers /></ProtectedRoute>} />
            <Route path="/business/feedback" element={<ProtectedRoute><FeedbackBoard /></ProtectedRoute>} />
            <Route path="/business/feedback/:id" element={<ProtectedRoute><FeedbackDetail /></ProtectedRoute>} />
            <Route path="/business/tasks" element={<ProtectedRoute><TasksDashboard /></ProtectedRoute>} />
            <Route path="/business/analytics" element={<ProtectedRoute><AnalyticsDashboard /></ProtectedRoute>} />
            <Route path="/business/messenger" element={<ProtectedRoute><Messenger /></ProtectedRoute>} />
            <Route path="/business/facility" element={<ProtectedRoute><FacilityMapPage /></ProtectedRoute>} />
            <Route path="/business/field-map" element={<ProtectedRoute><FieldMapPage /></ProtectedRoute>} />
            <Route path="/business/areas/:areaId" element={<ProtectedRoute><AreaProfilePage /></ProtectedRoute>} />
            <Route path="/business/ops" element={<ProtectedRoute><OpsMissionControl /></ProtectedRoute>} />
            <Route path="/business/canvases" element={<ProtectedRoute><WorkflowWhiteboards /></ProtectedRoute>} />
            <Route path="/business/meetings" element={<ProtectedRoute><MeetingsDashboard /></ProtectedRoute>} />
            <Route path="/business/time" element={<ProtectedRoute><TimeClockApp /></ProtectedRoute>} />
            <Route path="/business/tech" element={<ProtectedRoute><TechPortal /></ProtectedRoute>} />
            <Route path="/business/tech/task/:jobId/:taskIndexStr" element={<ProtectedRoute><TechTaskWorkspace /></ProtectedRoute>} />
            <Route path="/business/jobs" element={<ProtectedRoute><EstimateHub /></ProtectedRoute>} />
            <Route path="/business/jobs/:jobId" element={<ProtectedRoute><EstimateBuilderV2 /></ProtectedRoute>} />
            <Route path="/business/jobs/:jobId/v1" element={<ProtectedRoute><EstimateBuilder /></ProtectedRoute>} />
            <Route path="/business/reports/:id" element={<ProtectedRoute><ReportViewerPage /></ProtectedRoute>} />
            <Route path="/oauth/companycam" element={<ProtectedRoute><OAuthCallback /></ProtectedRoute>} />
            
            {/* Helper Redirects & 404 Catch-All */}
            <Route path="/feedback" element={<Navigate to="/business/feedback" replace />} />
            <Route path="/dashboard" element={<ProtectedRoute><MissionControlDashboard /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
)
