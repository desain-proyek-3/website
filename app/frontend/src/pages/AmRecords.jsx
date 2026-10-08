import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import DentalUploadPanel from '../components/DentalUploadPanel.jsx'
import { VIEW_TYPES, createSubject, deleteSubject, listSubjectImages, listSubjects } from '../lib/api.js'
import { useDentalUpload } from '../lib/useDentalUpload.js'

// Ante-mortem data is admin-only (enforced by the backend too).
const NO_ACCESS_MSG = 'Data ante-mortem hanya dapat dikelola oleh admin.'

const EMPTY_FORM = { full_name: '', case_reference: '', notes: '' }

const inputCls =
  'mt-1.5 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[13.5px] ' +
  'placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10'

function AngleChips({ views }) {
  return (
    <div className="flex gap-1">
      {VIEW_TYPES.map((v) => {
        const on = views?.includes(v.value)
        return (
          <span
            key={v.value}
            title={`${v.label}: ${on ? 'sudah ada citra' : 'belum ada citra'}`}
            className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] tracking-wider ring-1 ${
              on ? 'bg-teal-50 text-teal-700 ring-teal-200' : 'bg-white text-slate-300 ring-slate-200'
            }`}
          >
            {v.label.toUpperCase()}
          </span>
        )
      })}
    </div>
  )
}

export default function AmRecords() {
  const [subjects, setSubjects] = useState([])
  const [viewsBySubject, setViewsBySubject] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [notice, setNotice] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { items } = await listSubjects({ subjectType: 'ante_mortem' })
      setSubjects(items)
      const entries = await Promise.all(
        items.map((s) =>
          listSubjectImages(s.id)
            .then(({ items: imgs }) => [s.id, imgs.map((i) => i.view_type)])
            .catch(() => [s.id, null]),
        ),
      )
      setViewsBySubject(Object.fromEntries(entries))
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const upload = useDentalUpload(selectedId, {
    noAccessMessage: NO_ACCESS_MSG,
    onCompleted: ({ imageId, view, teeth }) => {
      const confs = teeth.map((t) => t.confidence).filter((c) => c != null)
      setLastResult({
        imageId,
        view,
        count: teeth.length,
        avg: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null,
      })
    },
  })

  // Keep the list's angle chips in sync with uploads on the selected subject.
  useEffect(() => {
    if (selectedId) setViewsBySubject((m) => ({ ...m, [selectedId]: upload.filledViews }))
  }, [selectedId, upload.filledViews])

  useEffect(() => {
    if (upload.phase === 'idle' || upload.phase === 'uploading') setLastResult(null)
  }, [upload.phase])

  const openDelete = () => {
    setDeleteError('')
    setConfirmOpen(true)
  }

  const closeDelete = useCallback(() => setConfirmOpen(false), [])

  const confirmDelete = async () => {
    const target = subjects.find((s) => s.id === selectedId)
    if (!target) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteSubject(target.id)
      setSubjects((list) => list.filter((s) => s.id !== target.id))
      setViewsBySubject(({ [target.id]: _removed, ...rest }) => rest)
      setSelectedId(null)
      setLastResult(null)
      setConfirmOpen(false)
      setNotice(`Subjek "${target.full_name}" beserta citranya telah dihapus.`)
    } catch (err) {
      setDeleteError(err.status === 403 ? NO_ACCESS_MSG : err.message)
    } finally {
      setDeleting(false)
    }
  }

  const select = (id) => {
    setNotice('')
    setCreating(false)
    setSelectedId(id)
    setLastResult(null)
  }

  const openCreate = () => {
    setNotice('')
    setSelectedId(null)
    setCreating(true)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim()) {
      setFormError('Nama lengkap wajib diisi untuk data ante-mortem.')
      return
    }
    setFormBusy(true)
    setFormError('')
    try {
      const created = await createSubject({
        subject_type: 'ante_mortem',
        full_name: form.full_name.trim(),
        case_reference: form.case_reference.trim() || null,
        notes: form.notes.trim() || null,
      })
      setSubjects((list) => [created, ...list])
      setViewsBySubject((m) => ({ ...m, [created.id]: [] }))
      select(created.id)
    } catch (err) {
      setFormError(err.status === 403 ? NO_ACCESS_MSG : err.message)
    } finally {
      setFormBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return subjects
    return subjects.filter((s) =>
      [s.full_name, s.case_reference, s.notes, s.id].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [subjects, query])

  const selected = subjects.find((s) => s.id === selectedId)
  const completeCount = subjects.filter((s) => viewsBySubject[s.id]?.length === VIEW_TYPES.length).length

  const selectedImageCount = selected ? upload.filledViews.length : 0

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

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Subject list */}
        <section className="card p-6 xl:col-span-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold text-ink">Database ante-mortem</h2>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {loading ? 'Memuat…' : `${subjects.length} subjek · ${completeCount} lengkap 3 sudut`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={load} disabled={loading} className="btn-ghost h-10 px-3" aria-label="Muat ulang">
                <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={openCreate} className="btn-primary h-10 px-4 text-[13.5px]">
                <UserPlus className="h-4 w-4" />
                Subjek AM baru
              </button>
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, referensi kasus, catatan…"
              aria-label="Cari subjek AM"
              className={`${inputCls.replace('mt-1.5 ', '')} pl-10`}
            />
          </div>

          {loadError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-[13px] text-rose-800">{loadError}</p>
            </div>
          )}

          <ul className="mt-4 max-h-[560px] space-y-2 overflow-y-auto scroll-slim pr-1">
            {!loading && filtered.length === 0 && (
              <li className="py-8 text-center text-[13px] text-slate-400">
                {subjects.length ? 'Tidak ada subjek yang cocok.' : 'Belum ada data ante-mortem.'}
              </li>
            )}
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => select(s.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    s.id === selectedId
                      ? 'border-teal-400 bg-teal-50/60'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-ink">{s.full_name}</div>
                      <div className="truncate font-mono text-[11px] text-slate-500">
                        {s.id.slice(0, 8)}
                        {s.case_reference && ` · ${s.case_reference}`}
                      </div>
                    </div>
                    <AngleChips views={viewsBySubject[s.id]} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Detail / create / upload */}
        <section className="card p-6 xl:col-span-7">
          {creating ? (
            <form onSubmit={submit} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-teal-700" />
                  <h2 className="text-[17px] font-semibold text-ink">Subjek ante-mortem baru</h2>
                </div>
                <button type="button" onClick={() => setCreating(false)} className="btn-ghost h-9 px-3 text-[12.5px]">
                  <X className="h-3.5 w-3.5" />
                  Batal
                </button>
              </div>
              <p className="text-[13px] text-slate-500">
                Data gigi semasa hidup dari keluarga atau klinik. Identitas wajib diisi; citra diunggah
                per sudut (depan, kiri, kanan) setelah subjek dibuat.
              </p>
              <div>
                <label htmlFor="am-name" className="block text-[12.5px] font-medium text-slate-700">
                  Nama lengkap
                </label>
                <input
                  id="am-name"
                  maxLength={255}
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="am-case" className="block text-[12.5px] font-medium text-slate-700">
                  Referensi kasus <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  id="am-case"
                  maxLength={100}
                  value={form.case_reference}
                  onChange={(e) => setForm((f) => ({ ...f, case_reference: e.target.value }))}
                  placeholder="Nomor laporan orang hilang / insiden"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="am-notes" className="block text-[12.5px] font-medium text-slate-700">
                  Catatan <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <textarea
                  id="am-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Sumber data (klinik, no. rekam medis), riwayat perawatan gigi, kontak keluarga…"
                  className={`${inputCls} h-auto py-2.5`}
                />
              </div>
              {formError && (
                <p className="flex items-center gap-2 text-[12.5px] font-medium text-rose-600">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {formError}
                </p>
              )}
              <button type="submit" disabled={formBusy} className="btn-primary h-10 px-5 text-[13.5px]">
                {formBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Buat subjek AM
              </button>
            </form>
          ) : !selected ? (
            <div className="flex h-[360px] flex-col items-center justify-center gap-3 text-center">
              <UserPlus className="h-8 w-8 text-slate-300" />
              <p className="max-w-[40ch] text-[13px] text-slate-400">
                Pilih subjek ante-mortem di daftar untuk mengunggah citranya, atau buat subjek baru.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-teal-50/60 px-4 py-3">
                <div className="min-w-0">
                  <div className="readout">SUBJEK ANTE-MORTEM</div>
                  <div className="mt-0.5 truncate text-[14px] font-semibold text-ink">
                    {selected.full_name}
                    <span className="ml-2 font-mono text-[11.5px] font-normal text-teal-700">{selected.id.slice(0, 8)}</span>
                  </div>
                  {selected.case_reference && <div className="text-[11.5px] text-slate-500">{selected.case_reference}</div>}
                  {selected.notes && <p className="mt-1 text-[12px] leading-snug text-slate-600">{selected.notes}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <AngleChips views={upload.filledViews} />
                  <button
                    onClick={openDelete}
                    disabled={upload.busy}
                    title={upload.busy ? 'Tunggu proses upload/AI selesai' : undefined}
                    className="btn-ghost h-8 px-2.5 text-[12px] text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus subjek
                  </button>
                </div>
              </div>

              <p className="mt-4 text-[12.5px] leading-snug text-slate-500">
                Citra diproses AI agar deteksi gigi &amp; embedding subjek tersimpan sebagai pembanding untuk
                pencocokan dengan data post-mortem. Selama layanan AI belum terhubung, gunakan{' '}
                <span className="font-medium text-slate-600">Upload tanpa AI</span> untuk menyimpan citranya dulu.
              </p>

              {/* allowSkipAi: TEMPORARY until the AI service is live — remove afterwards */}
              <DentalUploadPanel
                upload={upload}
                allFilledHint="Ketiga sudut subjek ini sudah terisi."
                allowSkipAi
              />

              {upload.phase === 'uploaded' && upload.uploaded && (
                <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-[13px] text-amber-900">
                    Citra sudut <span className="font-semibold">{upload.uploaded.view}</span> tersimpan{' '}
                    <span className="font-semibold">tanpa pemrosesan AI</span> — belum ada deteksi gigi maupun
                    embedding untuk pencocokan. Jalankan AI untuk citra ini setelah layanan AI terhubung.
                  </p>
                </div>
              )}

              {lastResult && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    <p className="text-[13px] text-teal-900">
                      Citra sudut <span className="font-semibold">{lastResult.view}</span> tersimpan dan diproses AI:{' '}
                      {lastResult.count} gigi terdeteksi
                      {lastResult.avg != null && `, rata-rata confidence ${lastResult.avg.toFixed(1)}%`}.
                    </p>
                  </div>
                  <Link
                    to={`/analysis?image=${lastResult.imageId}`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Lihat di Feature analysis
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmOpen && Boolean(selected)}
        title="Hapus subjek ante-mortem?"
        confirmLabel="Hapus subjek"
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={closeDelete}
      >
        {selected && (
          <>
            <p>
              <span className="font-semibold text-ink">{selected.full_name}</span>{' '}
              <span className="font-mono text-[12px] text-slate-500">{selected.id.slice(0, 8)}</span>
              {selectedImageCount > 0
                ? ` beserta ${selectedImageCount} citranya akan dihapus dari aplikasi.`
                : ' akan dihapus dari aplikasi.'}
            </p>
            <p className="mt-2 text-[12.5px] text-slate-500">
              Data tidak dihapus permanen (soft-delete): tetap tersimpan di database dan tercatat di audit log
              demi chain-of-custody, tetapi tidak lagi tampil atau dapat diubah di aplikasi.
            </p>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
