import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit3,
  LayoutGrid,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  UploadCloud,
  Waves,
  X,
} from 'lucide-react'
import Logo from './Logo.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { usePosko } from '../context/PoskoContext.jsx'
import { CASE } from '../lib/data.js'

const NAV = [
  { to: '/identify', label: 'Upload & identify', icon: UploadCloud, meta: 'new scan' },
  { to: '/dashboard', label: 'Match dashboard', icon: LayoutGrid, meta: '128 pairs' },
  { to: '/review', label: 'Forensic review', icon: ShieldCheck, meta: '14 waiting' },
  { to: '/analysis', label: 'Feature analysis', icon: Activity, meta: 'live' },
]

const TITLES = {
  '/identify': { h: 'Upload & identify', s: 'Kirim gambar dental post-mortem ke layanan identifikasi AI' },
  '/dashboard': { h: 'Match dashboard', s: 'Rekam ante-mortem dan post-mortem yang dipasangkan oleh engine' },
  '/review': { h: 'Forensic review', s: 'Hasil cocok yang memerlukan konfirmasi anggota tim' },
  '/analysis': { h: 'Feature extraction', s: 'Pengukuran tingkat gigi dari radiograf post-mortem' },
}

const INITIAL_NOTIFICATIONS = [
  {
    id: 1,
    title: 'Kandidat Match Ditemukan',
    desc: 'PM-0418 cocok dengan AM-2291 (Confidence: 98.4%)',
    time: '5 mnt yang lalu',
    unread: true,
    type: 'success',
  },
  {
    id: 2,
    title: 'Peninjauan Ulang Diperlukan',
    desc: 'PM-0422 memerlukan verifikasi peninjau kedua',
    time: '25 mnt yang lalu',
    unread: true,
    type: 'warning',
  },
  {
    id: 3,
    title: 'Ekstraksi Fitur Selesai',
    desc: 'Landmark 32 poin berhasil diproses untuk PM-0431',
    time: '1 jam yang lalu',
    unread: true,
    type: 'info',
  },
]

function SidebarBody({ user, onLogout, posko }) {
  return (
    <div className="flex h-full flex-col bg-white text-slate-700">
      {/* Top Header Logo in Sidebar */}
      <div className="px-5 pb-5 pt-5 border-b border-slate-100 flex items-center justify-between">
        <Logo className="h-10 w-auto" to="/" />
      </div>

      {/* Active Posko Box inside Sidebar */}
      <div className="m-4 rounded-xl border border-teal-200/80 bg-teal-50/60 p-4">
        <div className="readout text-teal-800 font-bold">POSKO / SEKTOR AKTIF</div>
        <div className="mt-1 font-sans text-[14px] font-bold text-teal-900">{posko}</div>
        <div className="mt-2 font-mono text-[11.5px] text-slate-500">{CASE.id}</div>
        <div className="mt-3 flex items-center gap-2 border-t border-teal-200/60 pt-2.5 text-[12px]">
          <span className="h-2 w-2 rounded-full bg-teal-600 animate-pulseDot" />
          <span className="text-slate-600 font-medium">
            {CASE.pmRecords} PM · {CASE.amRecords} AM records
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ to, label, icon: Icon, meta }) => (
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
                  {meta}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Sidebar Footer User Profile */}
      <div className="border-t border-slate-100 p-4 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-700 font-mono text-[12px] font-bold text-white shadow-sm">
            {user?.initials || 'AK'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">{user?.name || 'Alicia Kiyoumi'}</div>
            <div className="truncate text-[11px] font-medium text-teal-700">{user?.role || 'Field Technician'}</div>
          </div>
          <button
            onClick={onLogout}
            title="Logout"
            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AppShell() {
  const [open, setOpen] = useState(true) // Collapsible sidebar state (no backdrop overlay)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS)
  const [isEditingPosko, setIsEditingPosko] = useState(false)

  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { posko, setPosko, PRESET_POSKOS } = usePosko()

  const title = TITLES[pathname] ?? TITLES['/dashboard']
  const unreadCount = notifications.filter((n) => n.unread).length

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
        {/* Top Bar Row */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Left: Menu Toggle & Search Bar */}
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

            <label className="relative flex min-w-0 max-w-[420px] flex-1 items-center">
              <Search className="pointer-events-none absolute left-3.5 h-[18px] w-[18px] text-slate-400" />
              <span className="sr-only">Search records</span>
              <input
                type="search"
                placeholder="Cari ID korban, rekam PM, atau dental chart…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-11 pr-4 text-[14px]
                           placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none
                           focus:ring-4 focus:ring-teal-500/10 shadow-sm transition-all"
              />
            </label>
          </div>

          {/* Right: Notifications & User Profile */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Active Case Pill */}
            <div className="hidden lg:flex h-11 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/80 px-3.5 text-teal-800">
              <Waves className="h-4 w-4 text-teal-600" />
              <span className="font-mono text-[12px] font-semibold">{CASE.id}</span>
            </div>

            {/* Interactive Notifications Popover */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications((v) => !v)}
                className={`relative rounded-xl border p-2.5 text-slate-600 transition-colors shadow-sm ${
                  showNotifications ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                aria-label="Notifications"
              >
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-signal-amber font-mono text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-teal-700" />
                      <h3 className="text-[14px] font-bold text-ink">Notifikasi DVI</h3>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllNotificationsRead}
                        className="text-[11.5px] font-semibold text-teal-700 hover:text-teal-900"
                      >
                        Tandai Dibaca
                      </button>
                    )}
                  </div>

                  <ul className="mt-2 divide-y divide-slate-100 max-h-72 overflow-y-auto scroll-slim">
                    {notifications.map((n) => (
                      <li key={n.id} className={`py-3 px-1 transition-colors ${n.unread ? 'bg-teal-50/40 rounded-xl px-2' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[13px] font-bold text-ink">{n.title}</span>
                          <span className="flex items-center gap-1 font-mono text-[10.5px] text-slate-400 shrink-0">
                            <Clock className="h-3 w-3" />
                            {n.time}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-slate-600">{n.desc}</p>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 border-t border-slate-100 pt-2 text-center">
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-[12px] font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Account Profile Badge in Header */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pr-3 shadow-sm">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-700 font-mono text-[13px] font-bold text-white shadow-sm">
                {user?.initials || 'AK'}
              </span>
              <div className="text-left">
                <div className="truncate text-[13px] font-semibold text-ink leading-tight">
                  {user?.name || 'Alicia Kiyoumi'}
                </div>
                <div className="truncate text-[11px] font-medium text-teal-700 leading-tight">
                  {user?.role || 'Field Technician'}
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

        {/* Bottom Bar Row (Page Title & Posko Selector) */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pb-4 pt-1 sm:px-6 lg:px-8 border-t border-slate-100">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-ink sm:text-[25px]">{title.h}</h1>
            <p className="mt-0.5 max-w-[62ch] text-[13px] text-slate-500">{title.s}</p>
          </div>

          {/* Posko / Sektor Selector */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <span className="text-[12px] font-bold text-slate-500 pl-1">POSKO / SEKTOR:</span>
            
            {!isEditingPosko ? (
              <div className="flex items-center gap-2">
                <select
                  value={PRESET_POSKOS.includes(posko) ? posko : 'custom'}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsEditingPosko(true)
                    } else {
                      setPosko(e.target.value)
                    }
                  }}
                  className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12.5px] font-bold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {PRESET_POSKOS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  <option value="custom">✏️ Custom / Manual Input...</option>
                </select>
                <button
                  onClick={() => setIsEditingPosko(true)}
                  className="p-1 text-slate-400 hover:text-teal-700"
                  title="Edit Posko Manual"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={posko}
                  onChange={(e) => setPosko(e.target.value)}
                  placeholder="Nama Posko/Sektor..."
                  autoFocus
                  className="h-8 rounded-lg border border-teal-500 bg-white px-2.5 text-[12.5px] font-semibold text-ink focus:outline-none"
                />
                <button
                  onClick={() => setIsEditingPosko(false)}
                  className="btn-primary h-8 px-2.5 text-[12px]"
                >
                  Simpan
                </button>
              </div>
            )}

            <nav aria-label="Breadcrumb" className="readout flex items-center gap-1 border-l border-slate-200 pl-2">
              <ChevronRight className="h-3 w-3 text-slate-400" />
              <span className="text-teal-700 font-semibold">{title.h.toUpperCase()}</span>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex flex-1 min-w-0">
        {/* Pure White Collapsible Sidebar (No backdrop mask, no page freeze!) */}
        {open && (
          <aside className="w-[272px] shrink-0 border-r border-slate-200 bg-white shadow-sm transition-all duration-200">
            <SidebarBody user={user} onLogout={handleLogout} posko={posko} />
          </aside>
        )}

        {/* Main Content Area (Fully interactive, clickable & scrollable) */}
        <main className="flex-1 min-w-0 px-4 pb-14 pt-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
