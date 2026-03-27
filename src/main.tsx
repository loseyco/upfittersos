import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { MainLayout } from './layouts/MainLayout'
import { PublicHero } from './pages/PublicHero'
import { TechPortal } from './pages/TechPortal'
import { OpsCommand } from './pages/OpsCommand'
import { SalesEngine } from './pages/SalesEngine'
import { PlatformGuide } from './pages/PlatformGuide'
import { MockJob } from './pages/MockJob'
import { AuthProvider } from './contexts/AuthContext'
import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'
import { ResetPassword } from './pages/auth/ResetPassword'
import { ProtectedRoute } from './components/ProtectedRoute'
import { UserProfile } from './pages/UserProfile'
import { CustomsPage } from './pages/subsidiaries/CustomsPage'
import { WrapsPage } from './pages/subsidiaries/WrapsPage'
import { HarnessPage } from './pages/subsidiaries/HarnessPage'
import { PalletPage } from './pages/subsidiaries/PalletPage'
import { DailyLogs } from './pages/DailyLogs'
import { SystemPitch } from './pages/SystemPitch'
import { CustomerPortal } from './pages/CustomerPortal'
import { MeetingNotes } from './pages/MeetingNotes'


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            {/* Public Routes */}
            <Route path="/" element={<PublicHero />} />
            <Route path="/guide" element={<PlatformGuide />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/customer/demo" element={<CustomerPortal />} />

            {/* Subsidiary Public Pages */}
            <Route path="/customs" element={<CustomsPage />} />
            <Route path="/wraps" element={<WrapsPage />} />
            <Route path="/harness" element={<HarnessPage />} />
            <Route path="/pallet" element={<PalletPage />} />

            {/* Internal Operational Routes */}
            <Route path="/tech" element={<ProtectedRoute><TechPortal /></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute><SalesEngine /></ProtectedRoute>} />
            <Route path="/ops" element={<ProtectedRoute><OpsCommand /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute><DailyLogs /></ProtectedRoute>} />
            <Route path="/meetings" element={<ProtectedRoute><MeetingNotes /></ProtectedRoute>} />
            <Route path="/vision" element={<ProtectedRoute><SystemPitch /></ProtectedRoute>} />
            <Route path="/jobs/mock" element={<ProtectedRoute><MockJob /></ProtectedRoute>} />


            {/* HR / Identity */}
            <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
)
