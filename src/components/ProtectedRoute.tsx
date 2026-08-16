import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoadingScreen } from './LoadingScreen'
import { UserRole } from '../types'

const ALL_STAFF_ROLES: UserRole[] = ['admin', 'headteacher', 'teacher']

interface ProtectedRouteProps {
  children: ReactNode
  // Defaults to any staff role. Pass e.g. allowedRoles={['admin']}
  // to lock a route down to a single role.
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles = ALL_STAFF_ROLES }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        You do not have access to this page.
      </div>
    )
  }

  return <>{children}</>
}
