import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Laden...</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
