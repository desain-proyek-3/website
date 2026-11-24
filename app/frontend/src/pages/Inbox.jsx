import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Inbox as InboxIcon, Link2, Loader2, RefreshCw, Search, Trash2, X } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import DeviceCaptureCard, { fmtDateTime } from '../components/DeviceCaptureCard.jsx'
import Modal from '../components/Modal.jsx'
import ViewPicker, { firstFreeView } from '../components/ViewPicker.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import {
  VIEW_TYPES,
  assignDeviceCapture,
  deleteDeviceCapture,
  listAssignableSubjects,
  listDeviceCaptures,
} from '../lib/api.js'

// Auto-refresh while the tab is visible (every request is audit-logged, so not too often)
const REFRESH_MS = 15_000
const PAGE_SIZE = 60

const viewLabel = (v) => VIEW_TYPES.find((t) => t.value === v)?.label || v
const typeBadge = (t) =>
  t === 'ante_mortem'
    ? { label: 'AM', cls: 'bg-sky-50 text-sky-700 ring-sky-200' }
    : { label: 'PM', cls: 'bg-amber-50 text-amber-700 ring-amber-200' }

function ErrorBox({ children }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      {children}
    </p>
  )
}

/** Pasangkan satu foto Inbox ke subjek yang citranya belum lengkap. */
function AssignDialog({ capture, isAdmin, onClose, onAssigned }) {
  const [q, setQ] = useState('')
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [subject, setSubject] = useState(null)
  const [view, setView] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Debounced search; < 2 karakter = subjek terbaru
  useEffect(() => {
    const term = q.trim()
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      setLoadError('')
      try {
        const { items } = await listAssignableSubjects({
          q: term.length >= 2 ? term : undefined,
          limit: 30,
          signal: controller.signal,
        })
        setSubjects(items)
      } catch (err) {
        if (err.name !== 'AbortError') setLoadError(err.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [q])

  const choose = (s) => {
    setSubject(s)
    setError('')
    setView(firstFreeView(s.filled_views, capture.view_type_hint))
  }

  const confirm = async () => {
    if (!subject || !view) return
    setBusy(true)
    setError('')
    try {
      await assignDeviceCapture(capture.id, { subjectId: subject.id, viewType: view })
      onAssigned(subject, view)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      maxWidth="max-w-[820px]"
      title="Pasangkan foto ke subjek"
      subtitle={`Foto ${capture.device_name || capture.device_code} · ${fmtDateTime(capture.captured_at || capture.received_at)}`}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-ghost h-10 px-4 text-[13.5px]">
            Batal
          </button>
          <button
            onClick={confirm}
            disabled={!subject || !view || busy}
            className="btn-primary h-10 px-4 text-[13.5px] disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Pasangkan
          </button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div>
          <img
            src={capture.image_url}
            alt="Foto dari device"
            className="aspect-[4/3] w-full rounded-lg bg-slate-100 object-cover"
          />
          <div className="mt-4 text-[12.5px] font-medium text-slate-700">Sudut citra</div>
          <div className="mt-1.5">
            <ViewPicker value={view} onChange={setView} filled={subject?.filled_views ?? []} disabled={!subject || busy} />
          </div>
          {!subject && <p className="mt-1.5 text-[11.5px] text-slate-400">Pilih subjek terlebih dahulu.</p>}
        </div>

        <div className="min-w-0">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama, referensi kasus, atau ID subjek…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
          <p className="mt-1.5 text-[11.5px] text-slate-400">
            Hanya subjek yang citranya belum lengkap (kurang dari 3 sudut)
            {isAdmin ? '.' : '. Subjek ante-mortem hanya dapat diisi admin.'}
          </p>

          <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
            {loadError ? (
              <ErrorBox>{loadError}</ErrorBox>
            ) : subjects.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-slate-500">
                {loading ? 'Memuat subjek…' : 'Tidak ada subjek yang cocok.'}
              </p>
            ) : (
              subjects.map((s) => {
                const badge = typeBadge(s.subject_type)
                const active = subject?.id === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => choose(s)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200 hover:border-teal-300'
                    }`}
                  >
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {s.full_name || 'Tanpa nama'}
                        <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">{s.id.slice(0, 8)}</span>
                      </span>
                      {s.case_reference && <span className="block truncate text-[11.5px] text-slate-500">{s.case_reference}</span>}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {VIEW_TYPES.map((v) => (
                        <span
                          key={v.value}
                          title={s.filled_views.includes(v.value) ? `${v.label}: sudah ada` : `${v.label}: kosong`}
                          className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${
                            s.filled_views.includes(v.value) ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {v.label}
                        </span>
                      ))}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </Modal>
  )
}

export default function Inbox() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadedAt, setLoadedAt] = useState(null)
  const [notice, setNotice] = useState(null)
  const [assigning, setAssigning] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const seq = useRef(0)

  const load = useCallback(async () => {
    const id = ++seq.current
    setLoading(true)
    try {
      const res = await listDeviceCaptures({ limit: PAGE_SIZE })
      if (id !== seq.current) return
      setItems(res.items)
      setTotal(res.total)
      setError('')
      setLoadedAt(new Date())
    } catch (err) {
      if (id === seq.current) setError(err.message)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, REFRESH_MS)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const onAssigned = (subject, view) => {
    const id = assigning.id
    setAssigning(null)
    setItems((prev) => prev.filter((c) => c.id !== id))
    setTotal((n) => Math.max(0, n - 1))
    setNotice({ subject, view })
    load()
  }

  const closeDelete = useCallback(() => {
    setDeleting(null)
    setDeleteError('')
  }, [])

  const confirmDelete = async () => {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await deleteDeviceCapture(deleting.id)
      setItems((prev) => prev.filter((c) => c.id !== deleting.id))
      setTotal((n) => Math.max(0, n - 1))
      closeDelete()
      load()
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
          <p className="flex-1 text-[13px] text-teal-900">
            Foto dipasangkan ke <span className="font-semibold">{notice.subject.full_name || 'Tanpa nama'}</span> (sudut{' '}
            {viewLabel(notice.view)}). Citra ini belum diproses AI. Jalankan dari kartu “Citra belum diproses AI” di{' '}
            <Link to="/dashboard" className="font-semibold underline underline-offset-2">
              Dashboard
            </Link>
            .
          </p>
          <button onClick={() => setNotice(null)} aria-label="Tutup" className="text-teal-700 hover:text-teal-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Foto dari device</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              {total.toLocaleString('id-ID')} foto belum dipasangkan ke subjek
              {loadedAt && ` · diperbarui ${loadedAt.toLocaleTimeString('id-ID', { timeStyle: 'short' })}`}
            </p>
          </div>
          <button onClick={load} disabled={loading} className="btn-ghost h-9 px-3 text-[12.5px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat ulang
          </button>
        </div>

        <div className="mt-5">
          {error && (
            <div className="mb-4">
              <ErrorBox>{error}</ErrorBox>
            </div>
          )}
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-14 text-center">
              {loading ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : <InboxIcon className="h-8 w-8 text-slate-300" />}
              <p className="text-[13px] text-slate-500">
                {loading ? 'Memuat Inbox…' : 'Inbox kosong. Foto yang diambil alat akan muncul di sini.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {items.map((c) => (
                <DeviceCaptureCard
                  key={c.id}
                  capture={c}
                  actions={
                    <>
                      <button onClick={() => setAssigning(c)} className="btn-primary h-9 flex-1 px-3 text-[12.5px]">
                        <Link2 className="h-3.5 w-3.5" />
                        Pasangkan
                      </button>
                      <button
                        onClick={() => setDeleting(c)}
                        className="btn-ghost h-9 px-3 text-[12.5px] text-rose-600 hover:bg-rose-50"
                        aria-label="Hapus dari Inbox"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Hapus
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          )}
          {total > items.length && (
            <p className="mt-4 text-center text-[12px] text-slate-400">
              Menampilkan {items.length} foto terbaru dari {total}.
            </p>
          )}
        </div>
      </section>

      {assigning && (
        <AssignDialog
          capture={assigning}
          isAdmin={user?.role === 'admin'}
          onClose={() => setAssigning(null)}
          onAssigned={onAssigned}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Hapus foto dari Inbox?"
        confirmLabel="Hapus"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={closeDelete}
      >
        Foto tidak lagi tampil di Inbox dan tidak bisa dipasangkan ke subjek. File asli tetap tersimpan dan tercatat di
        audit log.
      </ConfirmDialog>
    </div>
  )
}
