import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Wraps protected routes — if the user is not logged in they are
 * redirected to /login, preserving the intended destination so they
 * can be sent back after authenticating. While a stored token is still
 * being validated against /auth/me, a spinner is shown instead.
 * With `roles`, a logged-in user whose role is not listed is sent to /dashboard.
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
