import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Loader2, UserCheck, UserPlus } from 'lucide-react'
import { Mark } from '../components/Logo.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { AVAILABLE_ROLES } from '../lib/auth.js'

export default function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState(AVAILABLE_ROLES[0])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!name || !email || !password || !confirmPassword) {
      setError('Semua field harus diisi.')
      return
    }

    if (password.length < 6) {
      setError('Password minimal 6 karakter.')
      return
    }

    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.')
      return
    }

    setLoading(true)
    try {
      signUp({ name, email, password, role })
      navigate('/dashboard', { replace: true })
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
            Buat akun untuk mulai identifikasi dental
          </p>
        </div>

        {/* Card */}
        <div className="card mt-8 p-7">
          <div className="flex items-center gap-2.5">
            <UserPlus className="h-5 w-5 text-teal-700" />
            <h2 className="text-[18px] font-semibold text-ink">Buat Akun</h2>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Isi data dan pilih peran tugas Anda
          </p>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-[13px] text-rose-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="name" className="block text-[13px] font-medium text-slate-700">
                Nama Lengkap
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama Lengkap / Teknisi"
                autoComplete="name"
                className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-4
                           text-[14px] placeholder:text-slate-400
                           focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-[13px] font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                autoComplete="email"
                className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-4
                           text-[14px] placeholder:text-slate-400
                           focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-[13px] font-medium text-slate-700">
                Peran / Role Tugas
              </label>
              <div className="relative mt-1.5">
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="block h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10
                             text-[14px] text-ink focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10"
                >
                  {AVAILABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <UserCheck className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
              </div>
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
                placeholder="Minimal 6 karakter"
                autoComplete="new-password"
                className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-4
                           text-[14px] placeholder:text-slate-400
                           focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-[13px] font-medium text-slate-700">
                Konfirmasi Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password"
                autoComplete="new-password"
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
                  Daftar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[13px] text-slate-500">
          Sudah punya akun?{' '}
          <Link to="/login" className="font-semibold text-teal-700 hover:text-teal-800">
            Login di sini
          </Link>
        </p>

        <p className="mt-8 text-center text-[11.5px] text-slate-400">
          Demo interface · not for operational identification without validation.
        </p>
      </div>
    </div>
  )
}
