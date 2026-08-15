import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useParentAuth } from '../../context/ParentAuthContext'
import { LoadingScreen } from '../LoadingScreen'

export function ParentProtectedRoute({ children }: { children: ReactNode }) {
  const { session, parentProfile, loading } = useParentAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!session || !parentProfile) {
    return <Navigate to="/parent/login" replace />
  }

  if (parentProfile.must_change_password) {
    return <Navigate to="/parent/change-password" replace />
  }

  return <>{children}</>
}
