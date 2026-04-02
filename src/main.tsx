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
import { RolesDoc } from './pages/docs/RolesDoc';
import { IntegrationsDoc } from './pages/docs/IntegrationsDoc';
import { StaffGuideDoc } from './pages/docs/StaffGuideDoc';
import { FeedbackGuideDoc } from './pages/docs/FeedbackGuideDoc';
import { ChangelogDoc } from './pages/docs/ChangelogDoc';
import { AuthProvider } from './contexts/AuthContext'
import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'
import { ResetPassword } from './pages/auth/ResetPassword'
import { AuthAction } from './pages/auth/AuthAction'
import { ProtectedRoute } from './components/ProtectedRoute'
import { UserProfile } from './pages/UserProfile'
import { SuperAdminDashboard } from './pages/admin/SuperAdminDashboard'
import { BusinessAdminSuite } from './pages/business/BusinessAdminSuite'
import { WorkspaceHub } from './pages/business/WorkspaceHub'
import { Coworkers } from './pages/business/Coworkers'
import { FeedbackBoard } from './pages/business/FeedbackBoard'
import { FeedbackDetail } from './pages/business/FeedbackDetail'
import { TasksDashboard } from './pages/business/TasksDashboard'

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
        <Routes>
          <Route element={<MainLayout />}>
            {/* Public Routes */}
            <Route path="/" element={<Navigate to="/workspace" replace />} />
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
            <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute requireSuperAdmin={true}><SuperAdminDashboard /></ProtectedRoute>} />
            <Route path="/business/manage" element={<ProtectedRoute><BusinessAdminSuite /></ProtectedRoute>} />
            <Route path="/business/coworkers" element={<ProtectedRoute><Coworkers /></ProtectedRoute>} />
            <Route path="/business/feedback" element={<ProtectedRoute requireSuperAdmin={true}><FeedbackBoard /></ProtectedRoute>} />
            <Route path="/business/feedback/:id" element={<ProtectedRoute requireSuperAdmin={true}><FeedbackDetail /></ProtectedRoute>} />
            <Route path="/business/tasks" element={<ProtectedRoute><TasksDashboard /></ProtectedRoute>} />
            
            {/* Helper Redirects & 404 Catch-All */}
            <Route path="/feedback" element={<Navigate to="/business/feedback" replace />} />
            <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
)
