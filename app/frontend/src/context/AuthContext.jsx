import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import {
  login as authLogin,
  logout as authLogout,
  fetchCurrentUser,
  hasToken,
} from '../lib/auth.js'
import { onUnauthorized } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // true while a stored token is being validated against /auth/me on load
  const [loading, setLoading] = useState(() => hasToken())

  // Any 401 from a protected endpoint drops the session; ProtectedRoute then
  // redirects to /login.
  useEffect(() => onUnauthorized(() => setUser(null)), [])

  useEffect(() => {
    if (!hasToken()) return
    let cancelled = false
    fetchCurrentUser()
      .then((profile) => {
        if (!cancelled) setUser(profile)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async ({ username, password }) => {
    const profile = await authLogin({ username, password })
    setUser(profile)
    return profile
  }, [])

  const logout = useCallback(() => {
    authLogout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
