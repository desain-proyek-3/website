import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { Mark } from '../components/Logo.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const from = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username || !password) {
      setError('Username dan password harus diisi.')
      return
    }

    setLoading(true)
    try {
      await login({ username: username.trim(), password })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <Mark className="h-12 w-12" />
          <h1 className="mt-4 text-[28px] font-extrabold tracking-tight text-ink">
            Dentify
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            Masuk ke workspace identifikasi dental
          </p>
        </div>

        {/* Card */}
        <div className="card mt-8 p-7">
          <h2 className="text-[18px] font-semibold text-ink">Login</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Masukkan username dan password akun Anda
          </p>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-[13px] text-rose-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="username" className="block text-[13px] font-medium text-slate-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                autoComplete="username"
                className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-4
                           text-[14px] placeholder:text-slate-400
                           focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[13px] font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-4
                           text-[14px] placeholder:text-slate-400
                           focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-2 h-11 w-full text-[14px] disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memproses…
                </>
              ) : (
                <>
                  Masuk
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[13px] text-slate-500">
          Belum punya akun? Akun dibuat oleh admin posko — hubungi admin Anda.
        </p>

        <p className="mt-8 text-center text-[11.5px] text-slate-400">
          Demo interface · not for operational identification without validation.
        </p>
      </div>
    </div>
  )
}
