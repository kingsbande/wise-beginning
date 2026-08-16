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
const HeadteacherDashboard = lazy(() =>
  import('./pages/HeadteacherDashboard').then((m) => ({ default: m.HeadteacherDashboard })),
)
const TeacherDashboard = lazy(() =>
  import('./pages/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard })),
)
const Staff = lazy(() => import('./pages/Staff').then((m) => ({ default: m.Staff })))
const ForceChangePasswordStaff = lazy(() =>
  import('./pages/staff/ForceChangePasswordStaff').then((m) => ({
    default: m.ForceChangePasswordStaff,
  })),
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
            <Route path="/staff/change-password" element={<ForceChangePasswordStaff />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ErrorBoundary>
                    <AdminDashboard />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/parent-accounts"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ErrorBoundary>
                    <ParentAccounts />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/grades"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ErrorBoundary>
                    <Grades />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/staff"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ErrorBoundary>
                    <Staff />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/headteacher"
              element={
                <ProtectedRoute allowedRoles={['headteacher']}>
                  <ErrorBoundary>
                    <HeadteacherDashboard />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={['teacher']}>
                  <ErrorBoundary>
                    <TeacherDashboard />
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
