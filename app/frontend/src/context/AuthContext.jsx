import { createContext, useContext, useState, useCallback } from 'react'
import {
  login as authLogin,
  signUp as authSignUp,
  logout as authLogout,
  getCurrentUser,
} from '../lib/auth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCurrentUser())

  const login = useCallback(({ email, password }) => {
    const session = authLogin({ email, password })
    setUser(session)
    return session
  }, [])

  const signUp = useCallback(({ name, email, password }) => {
    const session = authSignUp({ name, email, password })
    setUser(session)
    return session
  }, [])

  const logout = useCallback(() => {
    authLogout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
