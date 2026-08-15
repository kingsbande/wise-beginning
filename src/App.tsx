import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { ParentAuthProvider } from './context/ParentAuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ParentProtectedRoute } from './components/parent/ParentProtectedRoute'
import { LoadingScreen } from './components/LoadingScreen'

// Each page is its own chunk now — the browser only downloads and
// executes Login's code (plus shared vendor libs) to show the login
// screen, instead of the whole app including jsPDF, the admin
// dashboard, grades, and the parent dashboard.
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const AdminDashboard = lazy(() =>
  import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
)
const ParentAccounts = lazy(() =>
  import('./pages/ParentAccounts').then((m) => ({ default: m.ParentAccounts })),
)
const Grades = lazy(() => import('./pages/Grades').then((m) => ({ default: m.Grades })))
const ForceChangePassword = lazy(() =>
  import('./pages/parent/ForceChangePassword').then((m) => ({ default: m.ForceChangePassword })),
)
const ParentDashboard = lazy(() =>
  import('./pages/parent/ParentDashboard').then((m) => ({ default: m.ParentDashboard })),
)

function ParentLayout() {
  return (
    <ParentAuthProvider>
      <Outlet />
    </ParentAuthProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/parent/login" element={<Login />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <AdminDashboard />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/parent-accounts"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <ParentAccounts />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/grades"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <Grades />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            <Route element={<ParentLayout />}>
              <Route path="/parent/change-password" element={<ForceChangePassword />} />
              <Route
                path="/parent"
                element={
                  <ParentProtectedRoute>
                    <ParentDashboard />
                  </ParentProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
