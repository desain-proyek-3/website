import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  RotateCcw,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react'
import { createUser, listUsers, updateUser } from '../lib/api.js'
import { PASSWORD_MIN_LENGTH, ROLES, roleLabel } from '../lib/auth.js'
import { useAuth } from '../context/AuthContext.jsx'

// Same rules as schemas/user.py (EMAIL_PATTERN, USERNAME_PATTERN).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,50}$/

const ROLE_CHIP = {
  admin: 'bg-violet-50 text-violet-700 ring-violet-200',
  examiner: 'bg-teal-50 text-teal-700 ring-teal-200',
  viewer: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const inputCls =
  'mt-1.5 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[13.5px] ' +
  'placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 ' +
  'disabled:bg-slate-50 disabled:text-slate-500'

const EMPTY_CREATE = { username: '', full_name: '', email: '', role: 'examiner', password: '', confirm: '' }

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-medium text-slate-700">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function validate(form, { creating }) {
  if (creating && !USERNAME_RE.test(form.username))
    return 'Username 3–50 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.'
  if (!form.full_name.trim()) return 'Nama lengkap wajib diisi.'
  if (!EMAIL_RE.test(form.email.trim())) return 'Format email tidak valid.'
  if (creating || form.password) {
    if (form.password.length < PASSWORD_MIN_LENGTH)
      return `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`
    if (form.password !== form.confirm) return 'Konfirmasi password tidak cocok.'
  }
  return null
}

export default function Users() {
  const { user: me } = useAuth()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // panel: null | { mode: 'create' } | { mode: 'edit', user }
  const [panel, setPanel] = useState(null)
  const [form, setForm] = useState(EMPTY_CREATE)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [togglingId, setTogglingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { items } = await listUsers()
      setUsers(items)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setPanel({ mode: 'create' })
    setForm(EMPTY_CREATE)
    setFormError('')
    setNotice('')
  }

  const openEdit = (u) => {
    setPanel({ mode: 'edit', user: u })
    setForm({ username: u.username, full_name: u.full_name, email: u.email, role: u.role, is_active: u.is_active, password: '', confirm: '' })
    setFormError('')
    setNotice('')
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const creating = panel.mode === 'create'
    const problem = validate(form, { creating })
    if (problem) {
      setFormError(problem)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (creating) {
        const created = await createUser({
          username: form.username.trim(),
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          role: form.role,
          password: form.password,
        })
        setNotice(
          `Akun "${created.username}" dibuat sebagai ${roleLabel(created.role)}. ` +
            'Sampaikan password awal kepada pengguna secara langsung.',
        )
      } else {
        const payload = {
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          is_active: form.is_active,
        }
        if (form.password) payload.password = form.password
        const updated = await updateUser(panel.user.id, payload)
        setNotice(
          `Akun "${updated.username}" diperbarui` + (form.password ? ' — password telah di-reset.' : '.'),
        )
      }
      setPanel(null)
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (u) => {
    setTogglingId(u.id)
    setNotice('')
    setLoadError('')
    try {
      const updated = await updateUser(u.id, {
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        is_active: !u.is_active,
      })
      setNotice(`Akun "${updated.username}" ${updated.is_active ? 'diaktifkan kembali' : 'dinonaktifkan'}.`)
      await load()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setTogglingId(null)
    }
  }

  const creating = panel?.mode === 'create'
  const editingSelf = panel?.mode === 'edit' && panel.user.id === me?.id
  const activeCount = users.filter((u) => u.is_active).length

  return (
    <div className="space-y-6">
      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
          <p className="flex-1 text-[13px] text-teal-900">{notice}</p>
          <button onClick={() => setNotice('')} aria-label="Tutup" className="text-teal-700 hover:text-teal-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {panel && (
        <section className="card p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {creating ? <UserPlus className="h-5 w-5 text-teal-700" /> : <Pencil className="h-5 w-5 text-teal-700" />}
              <h2 className="text-[17px] font-semibold text-ink">
                {creating ? 'Tambah user baru' : `Edit akun ${panel.user.username}`}
              </h2>
            </div>
            <button onClick={() => setPanel(null)} className="btn-ghost h-9 px-3 text-[12.5px]">
              <X className="h-3.5 w-3.5" />
              Batal
            </button>
          </div>

          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field id="u-username" label="Username" hint={creating ? '(untuk login, tidak bisa diubah)' : '(tidak bisa diubah)'}>
              <input
                id="u-username"
                value={form.username}
                onChange={set('username')}
                disabled={!creating}
                maxLength={50}
                autoComplete="off"
                className={inputCls}
              />
            </Field>
            <Field id="u-name" label="Nama lengkap">
              <input id="u-name" value={form.full_name} onChange={set('full_name')} maxLength={255} className={inputCls} />
            </Field>
            <Field id="u-email" label="Email">
              <input id="u-email" type="email" value={form.email} onChange={set('email')} maxLength={255} className={inputCls} />
            </Field>
            <Field id="u-role" label="Role" hint={editingSelf ? '(tidak bisa mengubah role sendiri)' : undefined}>
              <select id="u-role" value={form.role} onChange={set('role')} disabled={editingSelf} className={inputCls}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11.5px] leading-snug text-slate-500">
                {ROLES.find((r) => r.value === form.role)?.desc}
              </p>
            </Field>
            <Field
              id="u-password"
              label={creating ? 'Password awal' : 'Reset password'}
              hint={creating ? `(min. ${PASSWORD_MIN_LENGTH} karakter)` : '(kosongkan bila tidak diubah)'}
            >
              <input
                id="u-password"
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
                className={inputCls}
              />
            </Field>
            <Field id="u-confirm" label="Konfirmasi password">
              <input
                id="u-confirm"
                type="password"
                value={form.confirm}
                onChange={set('confirm')}
                autoComplete="new-password"
                disabled={!creating && !form.password}
                className={inputCls}
              />
            </Field>

            {!creating && (
              <label className="flex items-center gap-2.5 text-[13px] text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  disabled={editingSelf}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Akun aktif (dapat login)
                {editingSelf && <span className="text-slate-400">— tidak bisa menonaktifkan akun sendiri</span>}
              </label>
            )}

            {formError && (
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-rose-600 sm:col-span-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {formError}
              </p>
            )}

            <div className="sm:col-span-2">
              <button type="submit" disabled={saving} className="btn-primary h-10 px-5 text-[13.5px]">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : creating ? (
                  <UserPlus className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {creating ? 'Buat akun' : 'Simpan perubahan'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Akun pengguna</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {loading ? 'Memuat…' : `${users.length} akun · ${activeCount} aktif`} · Tidak ada pendaftaran
              mandiri; akun hanya dibuat oleh admin.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} disabled={loading} className="btn-ghost h-10 px-3" aria-label="Muat ulang">
              <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={openCreate} className="btn-primary h-10 px-4 text-[13.5px]">
              <UserPlus className="h-4 w-4" />
              Tambah user
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-[13px] text-rose-800">{loadError}</p>
          </div>
        )}

        <div className="mt-5 scroll-slim overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {['Nama / Username', 'Email', 'Role', 'Status', 'Dibuat', ''].map((h) => (
                  <th key={h} className="px-4 py-3 font-mono text-[10.5px] font-medium tracking-[.12em] text-slate-500">
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const self = u.id === me?.id
                return (
                  <tr key={u.id} className={`hover:bg-slate-50/60 ${u.is_active ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3.5">
                      <div className="text-[13px] font-semibold text-ink">
                        {u.full_name}
                        {self && <span className="ml-2 font-mono text-[10.5px] font-medium text-teal-700">(ANDA)</span>}
                      </div>
                      <div className="font-mono text-[11.5px] text-slate-500">{u.username}</div>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] text-slate-600">{u.email}</td>
                    <td className="px-4 py-3.5">
                      <span className={`chip whitespace-nowrap ring-1 ${ROLE_CHIP[u.role]}`}>{roleLabel(u.role)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {u.is_active ? (
                        <span className="chip bg-teal-50 text-teal-700 ring-1 ring-teal-200">
                          <UserCheck className="h-3 w-3" />
                          AKTIF
                        </span>
                      ) : (
                        <span className="chip bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                          <UserX className="h-3 w-3" />
                          NONAKTIF
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px] text-slate-500">
                      {new Date(u.created_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(u)} className="btn-ghost h-8 px-2.5 text-[12px]" title="Edit / reset password">
                          <Pencil className="h-3.5 w-3.5" />
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        {!self && (
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={togglingId === u.id}
                            className={`btn-ghost h-8 px-2.5 text-[12px] ${u.is_active ? 'text-rose-600 hover:bg-rose-50' : ''}`}
                          >
                            {togglingId === u.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : u.is_active ? (
                              <UserX className="h-3.5 w-3.5" />
                            ) : (
                              <UserCheck className="h-3.5 w-3.5" />
                            )}
                            {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
