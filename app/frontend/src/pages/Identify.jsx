import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  History,
  FileSpreadsheet,
  FlaskConical,
  Loader2,
  Lock,
  ServerCog,
  Trash2,
  UserPlus,
} from 'lucide-react'
import DentalUploadPanel from '../components/DentalUploadPanel.jsx'
import { VIEW_TYPES, createSubject, mockCandidates } from '../lib/api.js'
import { DEFAULT_NO_ACCESS_MSG, useDentalUpload } from '../lib/useDentalUpload.js'
import { CASE } from '../lib/data.js'
import { useAuth } from '../context/AuthContext.jsx'
import { usePosko } from '../context/PoskoContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'

// Backend roles allowed to create post-mortem subjects, upload and trigger inference.
const WRITE_ROLES = ['admin', 'examiner']

const STATUS_STYLE = {
  match: { chip: 'bg-teal-50 text-teal-700 ring-teal-200', Icon: CheckCircle2, word: 'MATCH' },
  review: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: CircleDot, word: 'REVIEW' },
  conflict: { chip: 'bg-rose-50 text-rose-700 ring-rose-200', Icon: AlertTriangle, word: 'CONFLICT' },
}

const inputCls =
  'mt-1.5 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[13.5px] ' +
  'placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10'

export default function Identify() {
  const { user } = useAuth()
  const { posko } = usePosko()
  const { history, addHistoryItem, clearHistory } = useHistory()
  const canWrite = WRITE_ROLES.includes(user?.role)

  // ── Subject (post-mortem) ──
  const [subject, setSubject] = useState(null)
  const [subjectForm, setSubjectForm] = useState({ full_name: '', case_reference: CASE.id, notes: '' })
  const [subjectBusy, setSubjectBusy] = useState(false)
  const [subjectError, setSubjectError] = useState('')
  const [result, setResult] = useState(null)

  // ── Upload + inference (shared with AmRecords) ──
  const upload = useDentalUpload(subject?.id ?? null, {
    onCompleted: ({ job, imageId, view, file, teeth }) => {
      const confs = teeth.map((t) => t.confidence).filter((c) => c != null)
      const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null
      const processingTimeMs = job.completed_at
        ? new Date(job.completed_at) - new Date(job.created_at)
        : null

      const data = {
        requestId: job.id,
        imageId,
        processingTimeMs,
        imageQuality: null, // not provided by the backend
        viewType: view,
        detectedTeeth: teeth,
        extractedFeatures: [
          { label: 'Gigi terdeteksi', value: `${teeth.length}` },
          { label: 'Rata-rata confidence', value: avg == null ? '–' : `${avg.toFixed(1)}%` },
          { label: 'Sudut citra', value: VIEW_TYPES.find((v) => v.value === view)?.label || view },
          { label: 'Job ID', value: job.id.slice(0, 8) },
        ],
        candidates: mockCandidates(file), // MOCK until the matching endpoint exists
      }
      setResult(data)

      addHistoryItem({
        id: `ANL-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        fileName: file.name,
        fileSize: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        posko: posko,
        operator: `${user?.full_name || user?.username} (${user?.role})`,
        result: data,
      })
    },
  })

  // A new run (or a reset / new file) clears the previous result.
  useEffect(() => {
    if (upload.phase === 'idle' || upload.phase === 'uploading') setResult(null)
  }, [upload.phase])

  const submitSubject = async (e) => {
    e.preventDefault()
    setSubjectError('')
    setSubjectBusy(true)
    try {
      const trimmed = Object.fromEntries(
        Object.entries(subjectForm).map(([k, v]) => [k, v.trim() || null]),
      )
      setSubject(await createSubject({ subject_type: 'post_mortem', ...trimmed }))
    } catch (err) {
      setSubjectError(err.status === 403 ? DEFAULT_NO_ACCESS_MSG : err.message)
    } finally {
      setSubjectBusy(false)
    }
  }

  const newSubject = () => {
    setSubject(null)
    setResult(null)
    setSubjectForm({ full_name: '', case_reference: CASE.id, notes: '' })
  }

  const topCandidate = result?.candidates?.[0]

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Subject + upload */}
        <section className="card p-6 xl:col-span-6">
          <h2 className="text-[17px] font-semibold text-ink">Upload a dental image</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Foto panoramik atau intraoral post-mortem. Gambar dikirim ke layanan identifikasi AI
            dan hasilnya akan tersimpan di riwayat analisis.
          </p>

          {!canWrite ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div>
                <p className="text-[13.5px] font-semibold text-slate-700">Akses hanya-baca</p>
                <p className="mt-0.5 text-[12.5px] text-slate-500">
                  {DEFAULT_NO_ACCESS_MSG} Role Anda saat ini: <span className="font-mono">{user?.role}</span>.
                  Hubungi admin bila Anda membutuhkan akses examiner.
                </p>
              </div>
            </div>
          ) : !subject ? (
            /* Step 1 — create the post-mortem subject */
            <form onSubmit={submitSubject} className="mt-5 space-y-3.5 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-teal-700" />
                <h3 className="text-[14px] font-semibold text-ink">Subjek post-mortem baru</h3>
              </div>
              <div>
                <label htmlFor="pm-name" className="block text-[12.5px] font-medium text-slate-700">
                  Nama / label subjek <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  id="pm-name"
                  maxLength={255}
                  value={subjectForm.full_name}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Kosongkan bila belum diketahui"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="pm-case" className="block text-[12.5px] font-medium text-slate-700">
                  Referensi kasus <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  id="pm-case"
                  maxLength={100}
                  value={subjectForm.case_reference}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, case_reference: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="pm-notes" className="block text-[12.5px] font-medium text-slate-700">
                  Catatan <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  id="pm-notes"
                  value={subjectForm.notes}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Lokasi temuan, kondisi fisik, dsb."
                  className={inputCls}
                />
              </div>
              {subjectError && (
                <p className="flex items-center gap-2 text-[12.5px] font-medium text-rose-600">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {subjectError}
                </p>
              )}
              <button type="submit" disabled={subjectBusy} className="btn-primary h-10 px-5 text-[13.5px]">
                {subjectBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Buat subjek
              </button>
            </form>
          ) : (
            <>
              {/* Active subject */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-teal-50/60 px-4 py-3">
                <div className="min-w-0">
                  <div className="readout">SUBJEK POST-MORTEM AKTIF</div>
                  <div className="mt-0.5 truncate text-[13.5px] font-semibold text-ink">
                    {subject.full_name || 'Tanpa nama'}
                    <span className="ml-2 font-mono text-[11.5px] font-normal text-teal-700">
                      {subject.id.slice(0, 8)}
                    </span>
                  </div>
                  {subject.case_reference && (
                    <div className="text-[11.5px] text-slate-500">{subject.case_reference}</div>
                  )}
                </div>
                <button onClick={newSubject} disabled={upload.busy} className="btn-ghost h-9 px-3 text-[12.5px]">
                  <UserPlus className="h-3.5 w-3.5" />
                  Subjek baru
                </button>
              </div>

              <DentalUploadPanel
                upload={upload}
                allFilledHint="Ketiga sudut subjek ini sudah terisi. Buat subjek baru untuk mengunggah citra lain."
              />
            </>
          )}
        </section>

        {/* Current Result */}
        <section className="card p-6 xl:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-ink">Hasil Analisis AI</h2>
            {result?.processingTimeMs != null && (
              <span className="font-mono text-[11.5px] text-slate-400">{result.processingTimeMs} ms</span>
            )}
          </div>

          {!result ? (
            <div className="mt-6 flex h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 text-center">
              <ServerCog className="h-8 w-8 text-slate-300" />
              <p className="max-w-[32ch] text-[13px] text-slate-400">
                Upload foto gigi dan jalankan model AI untuk melihat kandidat yang cocok di sini.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div>
                <h3 className="readout">FITUR GIGI TEREKSTRAKSI</h3>
                <dl className="mt-2.5 grid grid-cols-2 gap-3">
                  {result.extractedFeatures.map((f) => (
                    <div key={f.label} className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                      <dt className="text-[11.5px] text-slate-500">{f.label}</dt>
                      <dd className="mt-0.5 font-mono text-[14px] font-semibold text-ink">{f.value}</dd>
                    </div>
                  ))}
                </dl>
                {result.detectedTeeth?.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {result.detectedTeeth.map((t, i) => (
                      <li
                        key={`${t.fdi}-${i}`}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 font-mono text-[12px] text-slate-600"
                      >
                        <span className="font-semibold text-ink">FDI {t.fdi}</span>
                        {t.confidence != null && <span className="ml-1.5">{t.confidence.toFixed(0)}%</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[12.5px] text-slate-500">
                    Model AI tidak mengembalikan data gigi untuk citra ini.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="readout">KANDIDAT HASIL COCOK</h3>
                  <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                    <FlaskConical className="h-3 w-3" />
                    DATA SIMULASI
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] text-slate-400">
                  Pencocokan dengan data ante-mortem belum tersedia di backend — kandidat di bawah hanya contoh.
                </p>
                <ul className="mt-2.5 space-y-2.5">
                  {result.candidates.map((c) => {
                    const s = STATUS_STYLE[c.status]
                    return (
                      <li key={c.amId} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-ink">{c.name}</span>
                              <span className="font-mono text-[12px] text-teal-700">{c.amId}</span>
                            </div>
                            <p className="mt-1 max-w-[46ch] text-[12.5px] leading-snug text-slate-500">
                              {c.notes}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-mono text-[20px] font-semibold leading-none text-ink">
                              {c.confidence}%
                            </div>
                            <span className={`chip mt-1.5 ring-1 ${s.chip}`}>
                              <s.Icon className="h-3 w-3" />
                              {s.word}
                            </span>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {result.imageId && (
                  <Link
                    to={`/analysis?image=${result.imageId}`}
                    className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Lihat di Feature analysis
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
                {topCandidate && (
                  <Link
                    to="/review"
                    className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Kirim hasil ke Forensic Review
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Riwayat Analisis Section (Requirement 5) */}
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
              <History className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold text-ink">Riwayat Analisis Upload</h2>
              <p className="mt-0.5 text-[13px] text-slate-500">
                Daftar seluruh gambar yang di-upload dan dianalisis oleh model AI di {posko}
              </p>
            </div>
          </div>

          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="btn-ghost h-9 px-3 text-[12.5px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus Riwayat
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="py-12 text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-[14px] font-medium text-slate-600">Belum ada riwayat analisis</p>
            <p className="mt-1 text-[13px] text-slate-400">
              Setiap gambar yang Anda upload dan proses dengan AI akan otomatis tercatat di sini.
            </p>
          </div>
        ) : (
          <div className="mt-5 scroll-slim overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {['ID Analisis', 'Waktu', 'File / Posko', 'Kandidat Utama', 'Confidence', 'Kualitas', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 font-mono text-[10.5px] font-medium tracking-[.12em] text-slate-500">
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => {
                  const topMatch = item.result?.candidates?.[0]
                  const s = topMatch ? STATUS_STYLE[topMatch.status] : null
                  const quality = item.result?.imageQuality?.score
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3.5 font-mono text-[12.5px] font-semibold text-teal-700">
                        {item.id}
                      </td>
                      <td className="px-4 py-3.5 text-[12.5px] text-slate-600 font-mono">
                        {item.timestamp}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[13px] font-medium text-ink">{item.fileName}</div>
                        <div className="text-[11.5px] text-slate-400">{item.posko} · {item.fileSize}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        {topMatch ? (
                          <div>
                            <span className="text-[13px] font-semibold text-ink">{topMatch.name}</span>
                            <span className="ml-2 font-mono text-[11.5px] text-teal-700">{topMatch.amId}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[14px] font-bold text-ink">
                        {topMatch ? `${topMatch.confidence}%` : '-'}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[12.5px] text-slate-600">
                        {quality != null ? `${quality}/100` : '–'}
                      </td>
                      <td className="px-4 py-3.5">
                        {s && (
                          <span className={`chip ring-1 ${s.chip}`}>
                            <s.Icon className="h-3 w-3" />
                            {s.word}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
