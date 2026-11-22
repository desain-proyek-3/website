import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  Database,
  LayoutGrid,
  LogOut,
  Menu,
  ShieldCheck,
  UploadCloud,
  Users,
} from 'lucide-react'
import HeaderSearch from './HeaderSearch.jsx'
import Logo from './Logo.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { initialsOf, roleLabel } from '../lib/auth.js'
import { getStatsSummary } from '../lib/api.js'

const fmtCount = (n) => (n == null ? '–' : n.toLocaleString('id-ID'))

// `meta` = small label next to each link; a function receives live counts (see useNavCounts).
const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, meta: (c) => `${fmtCount(c.pairs)} pairs` },
  { to: '/identify', label: 'Upload & identify', icon: UploadCloud, meta: 'new scan' },
  { to: '/review', label: 'Forensic review', icon: ShieldCheck, meta: (c) => `${fmtCount(c.waiting)} waiting` },
  { to: '/analysis', label: 'Feature analysis', icon: Activity, meta: 'live' },
  { to: '/subjects', label: 'Subject Data', icon: Database, meta: 'admin', roles: ['admin'] },
  { to: '/users', label: 'Manajemen user', icon: Users, meta: 'admin', roles: ['admin'] },
]

const COUNTS_REFRESH_MS = 60_000

/**
 * Matching-result counts for the sidebar labels (same source as the Dashboard):
 * pairs = pending + confirmed + rejected, waiting = pending review.
 * Refreshed on every page change and every minute; null while unknown / on error.
 */
function useNavCounts(pathname) {
  const [counts, setCounts] = useState({ pairs: null, waiting: null })

  useEffect(() => {
    let cancelled = false
    const refresh = () =>
      getStatsSummary()
        .then(({ matching_results: m }) => {
          if (cancelled) return
          setCounts({ pairs: m.pending_review + m.confirmed + m.rejected, waiting: m.pending_review })
        })
        .catch(() => !cancelled && setCounts({ pairs: null, waiting: null }))
    refresh()
    const t = setInterval(refresh, COUNTS_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [pathname])

  return counts
}

const TITLES = {
  '/identify': { h: 'Upload & identify', s: 'Kirim gambar dental post-mortem ke layanan identifikasi AI' },
  '/dashboard': { h: 'Dashboard', s: 'Rekam ante-mortem dan post-mortem yang dipasangkan oleh engine' },
  '/review': { h: 'Forensic review', s: 'Hasil cocok yang memerlukan konfirmasi anggota tim' },
  '/analysis': { h: 'Feature extraction', s: 'Pengukuran tingkat gigi dari radiograf post-mortem' },
  '/subjects': { h: 'Subject Data', s: 'Kelola subjek ante-mortem dan post-mortem beserta citra gigi dan status AI-nya' },
  '/users': { h: 'Manajemen user', s: 'Kelola akun petugas, role, dan status aktif' },
}

function SidebarBody({ user, counts }) {
  return (
    <div className="flex h-full flex-col bg-white text-slate-700">
      {/* Logo — same height as the header's top row */}
      <div className="flex h-[69px] shrink-0 items-center border-b border-slate-100 px-5">
        <Logo className="h-10 w-auto" to="/" />
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.filter((n) => !n.roles || n.roles.includes(user?.role)).map(({ to, label, icon: Icon, meta }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'group flex items-center gap-3 rounded-xl px-3.5 py-3 text-[14px] transition-all duration-150',
                isActive
                  ? 'bg-teal-700 text-white font-semibold shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-teal-900',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-teal-700'}`} strokeWidth={2} />
                <span className="flex-1 font-medium">{label}</span>
                <span
                  className={`font-mono text-[10px] tracking-wider rounded-md px-1.5 py-0.5 ${
                    isActive ? 'bg-teal-800 text-teal-100' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                  }`}
                >
                  {typeof meta === 'function' ? meta(counts) : meta}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function AppShell() {
  const [open, setOpen] = useState(true) // Collapsible sidebar state (no backdrop overlay)

  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const counts = useNavCounts(pathname)

  const title =
    TITLES[pathname] ??
    (pathname.startsWith('/review/report/')
      ? { h: 'Laporan identifikasi', s: 'Laporan format INTERPOL DVI untuk pasangan PM–AM yang dikonfirmasi' }
      : TITLES['/dashboard'])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar — full viewport height from the very top; the header sits to its right */}
      {open && (
        <aside className="sticky top-0 z-30 h-screen w-[272px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white shadow-sm scroll-slim print:hidden">
          <SidebarBody user={user} counts={counts} />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm print:hidden">
        {/* Top Bar Row */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Left: Menu Toggle, Logo (when the sidebar is closed) & subject search */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => setOpen((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13.5px] font-semibold transition-all shadow-sm ${
                open
                  ? 'border-teal-300 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5 text-teal-700" />
              <span>Menu</span>
            </button>

            {!open && <Logo className="h-9 w-auto shrink-0" to="/" />}

            <HeaderSearch />
          </div>

          {/* Right: User Profile */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Account Profile Badge in Header */}
            <div
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pr-3 shadow-sm"
              title={user ? `${user.username} · ${user.email}` : undefined}
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-700 font-mono text-[13px] font-bold text-white shadow-sm">
                {initialsOf(user?.full_name || user?.username)}
              </span>
              <div className="min-w-0 max-w-[200px] text-left">
                <div className="truncate text-[13px] font-semibold text-ink leading-tight">
                  {user?.full_name || user?.username}
                </div>
                <div className="truncate text-[11px] font-medium text-teal-700 leading-tight">
                  {roleLabel(user?.role)}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Logout"
                className="ml-1.5 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar Row (Page Title) */}
        <div className="border-t border-slate-100 px-4 pb-4 pt-1 sm:px-6 lg:px-8">
          <h1 className="text-[22px] font-bold tracking-tight text-ink sm:text-[25px]">{title.h}</h1>
          <p className="mt-0.5 max-w-[62ch] text-[13px] text-slate-500">{title.s}</p>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 px-4 pb-14 pt-6 sm:px-6 lg:px-8 print:p-0">
        <Outlet />
      </main>
      </div>
    </div>
  )
}
