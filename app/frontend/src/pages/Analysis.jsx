import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Crosshair,
  FileText,
  GitCompareArrows,
  Hash,
  ImageOff,
  Loader2,
  Maximize2,
  RotateCcw,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  AI_STATUS_LABEL,
  ApiError,
  PollTimeoutError,
  VIEW_TYPES,
  bboxToPixels,
  decideReanalysis,
  getDentalImage,
  getMatchingComparison,
  getMatchingResult,
  getSubject,
  getToothRecords,
  isAiRunning,
  listMatchingResults,
  listSubjectImages,
  listSubjects,
  pollInferenceJob,
  runMatching,
  startReanalysis,
} from '../lib/api.js'
import ReanalysisDialog from '../components/ReanalysisDialog.jsx'
import RunAiButton from '../components/RunAiButton.jsx'
import ToothOverlay from '../components/ToothOverlay.jsx'
import ToothComparisonTable from '../components/ToothComparisonTable.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const FULL_DENTITION = 32

const pct = (v) => (v == null ? '–' : `${(v <= 1 ? v * 100 : v).toFixed(1)}%`)
const confValue = (t) => (t.confidence_score == null ? null : t.confidence_score <= 1 ? t.confidence_score * 100 : t.confidence_score)
const viewLabel = (v) => VIEW_TYPES.find((x) => x.value === v)?.label || v

const DECISION = {
  confirmed: { label: 'Dikonfirmasi', cls: 'bg-teal-50 text-teal-700 ring-teal-200' },
  rejected: { label: 'Ditolak', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  pending_review: { label: 'Menunggu review', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
}
const DECISION_ORDER = { confirmed: 0, pending_review: 1, rejected: 2 }

/**
 * PM vs AM per-tooth comparison (GET /matching-results/{id}/comparison) for the
 * selected subject: a PM shows its AM candidates, an AM shows the PMs matched to it.
 */
function MorphologyComparison({ subject, selectedId, onSelect, reloadKey, canRunMatching }) {
  const [results, setResults] = useState([])
  const [comparison, setComparison] = useState(null)
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [loading, setLoading] = useState({ list: false, comparison: false, run: false })
  const [error, setError] = useState('')
  const [listKey, setListKey] = useState(0)
  const isPm = subject?.subject_type === 'post_mortem'

  useEffect(() => {
    setResults([])
    setComparison(null)
    setError('')
    if (!subject) return
    let cancelled = false
    setLoading((l) => ({ ...l, list: true }))
    listMatchingResults(isPm ? { pmSubjectId: subject.id, limit: 100 } : { amSubjectId: subject.id, limit: 100 })
      .then(({ items }) => {
        if (cancelled) return
        // newest first → keep one row per counterpart subject, then decided pairs first
        const seen = new Set()
        const unique = items.filter((r) => {
          const other = isPm ? r.am_subject_id : r.pm_subject_id
          if (seen.has(other)) return false
          seen.add(other)
          return true
        })
        unique.sort((a, b) => DECISION_ORDER[a.status] - DECISION_ORDER[b.status] || (a.rank ?? 99) - (b.rank ?? 99))
        setResults(unique)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading((l) => ({ ...l, list: false })))
    return () => {
      cancelled = true
    }
  }, [subject?.id, listKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = results.find((r) => r.id === selectedId) || results[0] || null

  useEffect(() => {
    setComparison(null)
    if (!selected) return
    let cancelled = false
    setLoading((l) => ({ ...l, comparison: true }))
    getMatchingComparison(selected.id)
      .then((c) => !cancelled && setComparison(c))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading((l) => ({ ...l, comparison: false })))
    return () => {
      cancelled = true
    }
  }, [selected?.id, reloadKey])

  const runMatchingNow = async () => {
    setError('')
    setLoading((l) => ({ ...l, run: true }))
    try {
      const { candidates } = await runMatching(subject.id)
      setListKey((k) => k + 1)
      if (candidates[0]) onSelect(candidates[0].id)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Subjek PM ini belum punya embedding — jalankan AI pada citranya terlebih dahulu.'
          : err.message,
      )
    } finally {
      setLoading((l) => ({ ...l, run: false }))
    }
  }

  if (!subject) return null
  const counterpart = (r) => (isPm ? r.am_subject : r.pm_subject)
  const cov = comparison && [
    ['PM', comparison.pm_coverage],
    ['AM', comparison.am_coverage],
  ]

  return (
    <section id="perbandingan-morfologi" className="card scroll-mt-28 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-teal-700" />
            <h2 className="text-[17px] font-semibold text-ink">Perbandingan morfologi PM vs AM</h2>
          </div>
          <p className="mt-1 max-w-[80ch] text-[13px] text-slate-500">
            {isPm
              ? 'Hasil deteksi gigi subjek ini dibandingkan per FDI dengan kandidat ante-mortem hasil pencocokan.'
              : 'Subjek ante-mortem ini dibandingkan dengan subjek post-mortem yang pernah dicocokkan dengannya.'}{' '}
            Format fitur morfologi mengikuti kontrak AI sementara (belum final).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPm && canRunMatching && (
            <button onClick={runMatchingNow} disabled={loading.run} className="btn-ghost h-9 px-3.5 text-[12.5px]">
              {loading.run ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompareArrows className="h-3.5 w-3.5" />}
              {results.length ? 'Cari ulang kandidat AM' : 'Cari kandidat AM'}
            </button>
          )}
          {selected?.status === 'confirmed' && (
            <Link to={`/review/report/${selected.id}`} className="btn-primary h-9 px-3.5 text-[12.5px]">
              <FileText className="h-3.5 w-3.5" />
              Laporan INTERPOL
            </Link>
          )}
        </div>
      </header>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-[13px] text-rose-800">{error}</p>
        </div>
      )}

      {loading.list ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        </div>
      ) : results.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-500">
          {isPm
            ? 'Belum ada hasil pencocokan untuk subjek ini.'
            : 'Subjek ante-mortem ini belum pernah muncul sebagai kandidat pencocokan.'}
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Pasangan pembanding">
            {results.map((r) => {
              const other = counterpart(r)
              const active = r.id === selected?.id
              const d = DECISION[r.status]
              return (
                <button
                  key={r.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(r.id)}
                  className={`rounded-xl border px-3.5 py-2 text-left transition-colors ${
                    active ? 'border-teal-400 bg-teal-50/60' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-400">#{r.rank ?? '–'}</span>
                    <span className="text-[13px] font-medium text-ink">{other?.full_name || 'Tanpa nama'}</span>
                    <span className="font-mono text-[12px] text-teal-700">
                      {r.confidence_score == null ? '–' : `${r.confidence_score.toFixed(1)}%`}
                    </span>
                  </div>
                  <span className={`chip mt-1 ring-1 ${d.cls}`}>{d.label}</span>
                </button>
              )
            })}
          </div>

          {loading.comparison || !comparison ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            </div>
          ) : (
            <div className="mt-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12.5px] text-slate-500">
                  Citra diproses AI —{' '}
                  {cov.map(([label, c], i) => (
                    <span
                      key={label}
                      className={c.images_with_results < c.images_total ? 'font-semibold text-amber-700' : ''}
                    >
                      {i > 0 && ' · '}
                      {label}: {c.images_with_results}/{c.images_total}
                    </span>
                  ))}
                  {cov.some(([, c]) => c.images_with_results < c.images_total) &&
                    ' (perbandingan belum lengkap — jalankan AI pada citra yang belum diproses)'}
                </p>
                <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
                  <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
                  Hanya tampilkan perbedaan
                </label>
              </div>
              <ToothComparisonTable comparison={comparison} onlyDifferences={onlyDiff} />
              <Link
                to={`/review?pm=${selected.pm_subject_id}`}
                className="mt-4 inline-block text-[12.5px] font-semibold text-teal-700 hover:text-teal-800"
              >
                Tinjau pasangan ini di Forensic Review →
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  )
}

const darkSelect =
  'h-8 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 font-mono text-[11.5px] text-slate-200 ' +
  'focus:border-teal-400 focus:outline-none'

export default function Analysis() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const imageParam = searchParams.get('image')
  const matchParam = searchParams.get('match')
  const subjectParam = searchParams.get('subject') // dari pencarian header

  const [overlay, setOverlay] = useState(true)
  const [labels, setLabels] = useState(true)

  const [subjects, setSubjects] = useState([])
  const [subjectId, setSubjectId] = useState('')
  const [images, setImages] = useState([])
  const [teeth, setTeeth] = useState([])
  const [natural, setNatural] = useState(null) // { w, h } of the loaded image
  const [loading, setLoading] = useState({ subjects: true, images: false, teeth: false })
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0) // bumped after an AI run to refetch images + teeth

  const image = images.find((i) => i.id === imageParam) || null

  // Update one query param while keeping the others (?image= & ?match= live together).
  const setParam = (key, value) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  // 1. PM + AM subjects; resolve the subject from ?image= or ?match= when given
  //    (?subject= ditangani efek 1b).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { items } = await listSubjects()
        if (cancelled) return
        setSubjects(items)
        if (subjectParam) {
          // efek 1b
        } else if (imageParam) {
          const img = await getDentalImage(imageParam)
          if (!cancelled) setSubjectId(img.subject_id)
        } else if (matchParam) {
          const match = await getMatchingResult(matchParam)
          if (!cancelled) setSubjectId(match.pm_subject_id)
        } else {
          const first = items.find((s) => s.subject_type === 'post_mortem') || items[0]
          if (first) setSubjectId(first.id)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading((l) => ({ ...l, subjects: false }))
      }
    })()
    return () => {
      cancelled = true
    }
    // only on mount — later changes to ?image= come from this page itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 1b. ?subject= — saat halaman dibuka dan saat pencarian header dipakai di halaman ini.
  //     Subjek di luar 100 terbaru diambil terpisah agar tetap muncul di dropdown.
  useEffect(() => {
    if (!subjectParam || loading.subjects) return
    setSubjectId(subjectParam)
    if (subjects.some((s) => s.id === subjectParam)) return
    let cancelled = false
    getSubject(subjectParam)
      .then((s) => {
        if (!cancelled) setSubjects((prev) => (prev.some((p) => p.id === s.id) ? prev : [s, ...prev]))
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [subjectParam, loading.subjects]) // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Images of the selected subject; keep ?image= pointing at one of them.
  useEffect(() => {
    if (!subjectId) return
    let cancelled = false
    setLoading((l) => ({ ...l, images: true }))
    listSubjectImages(subjectId)
      .then(({ items }) => {
        if (cancelled) return
        const order = VIEW_TYPES.map((v) => v.value)
        const sorted = [...items].sort((a, b) => order.indexOf(a.view_type) - order.indexOf(b.view_type))
        setImages(sorted)
        const current = new URLSearchParams(window.location.search).get('image')
        if (!sorted.some((i) => i.id === current)) setParam('image', sorted[0]?.id)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading((l) => ({ ...l, images: false })))
    return () => {
      cancelled = true
    }
  }, [subjectId, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Image dimensions come from <img onLoad>; reset only when a different image is shown
  // (a reload after an AI run keeps the same <img>, which does not fire onLoad again).
  useEffect(() => setNatural(null), [image?.id])

  // 3. Tooth records of the selected image.
  useEffect(() => {
    setTeeth([])
    if (!image) return
    let cancelled = false
    setLoading((l) => ({ ...l, teeth: true }))
    getToothRecords(image.id)
      .then(({ items }) => !cancelled && setTeeth(items))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading((l) => ({ ...l, teeth: false })))
    return () => {
      cancelled = true
    }
  }, [image?.id, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const confs = teeth.map(confValue).filter((c) => c != null)
    const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null
    const lowest = teeth.reduce((lo, t) => {
      const c = confValue(t)
      return c != null && (lo == null || c < confValue(lo)) ? t : lo
    }, null)
    const withLandmarks = teeth.filter((t) => t.landmarks && Object.keys(t.landmarks).length).length
    return { avg, lowest, withLandmarks }
  }, [teeth])

  const boxes = useMemo(
    () =>
      natural
        ? teeth
            .map((t) => ({ t, box: bboxToPixels(t.bbox, natural.w, natural.h) }))
            .filter((b) => b.box)
        : [],
    [teeth, natural],
  )

  const subject = subjects.find((s) => s.id === subjectId)
  const hasResults = teeth.length > 0
  // Same rule as the backend: AM data (incl. its inference) is admin-only, PM is admin + examiner.
  const canRunAi =
    !!subject && (user?.role === 'admin' || (user?.role === 'examiner' && subject.subject_type === 'post_mortem'))
  const refreshAfterAi = () => setReloadKey((k) => k + 1)

  // ── Analisis ulang: hasil baru ditahan sampai Confirm/Reject di pop-up ──
  // re.phase: idle | starting | running | review (hasil siap, menunggu keputusan) | failed
  const canReanalyze = canRunAi
  const [re, setRe] = useState({ phase: 'idle' })
  const [reDialog, setReDialog] = useState(false)
  const [reNotice, setReNotice] = useState(null) // { tone: 'success'|'info'|'error', text, pm? }
  const rePoll = useRef(null)
  const reBusy = re.phase === 'starting' || re.phase === 'running'

  const followReanalysis = useCallback(async (jobId, { openWhenDone }) => {
    rePoll.current?.abort()
    const ctrl = new AbortController()
    rePoll.current = ctrl
    setRe({ phase: 'running', jobId })
    try {
      const job = await pollInferenceJob(jobId, { signal: ctrl.signal })
      if (job.status === 'completed') {
        setRe({ phase: 'review', jobId })
        if (openWhenDone) setReDialog(true)
      } else {
        setRe({ phase: 'failed', jobId, error: job.error_message })
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setRe({ phase: 'idle' })
      setReNotice({
        tone: 'error',
        text:
          err instanceof PollTimeoutError
            ? 'Analisis ulang belum selesai dalam batas waktu — muat ulang halaman nanti untuk meninjau hasilnya.'
            : err.message,
      })
    }
  }, [])

  // Sinkron dengan status dari server saat citra dibuka / dimuat ulang (mis. kembali ke halaman ini).
  useEffect(() => {
    rePoll.current?.abort()
    setReDialog(false)
    const r = image?.reanalysis
    if (!r) setRe({ phase: 'idle' })
    else if (isAiRunning(r.status)) followReanalysis(r.job_id, { openWhenDone: true })
    else if (r.status === 'completed') setRe({ phase: 'review', jobId: r.job_id })
    else setRe({ phase: 'failed', jobId: r.job_id, error: r.error_message })
  }, [image?.id, image?.reanalysis?.job_id, image?.reanalysis?.status, followReanalysis])
  useEffect(() => setReNotice(null), [image?.id])
  useEffect(() => () => rePoll.current?.abort(), [])

  const runReanalysis = async () => {
    if (!image) return
    setReNotice(null)
    setRe({ phase: 'starting' })
    try {
      const job = await startReanalysis(image.id)
      followReanalysis(job.id, { openWhenDone: true })
    } catch (err) {
      setRe({ phase: 'idle' })
      setReNotice({ tone: 'error', text: err.message })
      if (err instanceof ApiError && err.status === 409) refreshAfterAi() // sinkronkan status citra
    }
  }

  const onReanalysisDecided = (review) => {
    setReDialog(false)
    setRe({ phase: 'idle' })
    setReNotice(
      review === 'confirmed'
        ? { tone: 'success', text: 'Hasil analisis ulang diterapkan.', pm: subject?.subject_type === 'post_mortem' }
        : { tone: 'info', text: 'Hasil analisis ulang ditolak — hasil sebelumnya dipertahankan.' },
    )
    refreshAfterAi()
  }

  const dismissFailedReanalysis = async () => {
    const jobId = re.jobId
    setRe({ phase: 'idle' })
    try {
      await decideReanalysis(jobId, 'reject') // tutup di server agar tidak muncul lagi
    } catch {
      // sudah ditutup / tidak berwenang — cukup disembunyikan
    }
    refreshAfterAi()
  }

  const scrollToMatching = () =>
    document.getElementById('perbandingan-morfologi')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-[13px] text-rose-800">{error}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Viewport */}
        <section className="xl:col-span-8">
          <div className="card-dark overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="chip bg-signal-rose/15 font-semibold text-signal-rose ring-1 ring-signal-rose/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal-rose animate-pulseDot" />
                  ARCH MAPPING
                </span>
                <select
                  aria-label="Subjek"
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value)
                    setSearchParams({}, { replace: true })
                  }}
                  disabled={loading.subjects || !subjects.length}
                  className={`${darkSelect} max-w-[260px]`}
                >
                  {!subjects.length && <option value="">Belum ada subjek</option>}
                  {[
                    ['post_mortem', 'Post-mortem (PM)'],
                    ['ante_mortem', 'Ante-mortem (AM)'],
                  ].map(([type, label]) => {
                    const group = subjects.filter((s) => s.subject_type === type)
                    return group.length ? (
                      <optgroup key={type} label={label}>
                        {group.map((s) => (
                          <option key={s.id} value={s.id}>
                            {(s.full_name || 'Tanpa nama') + ' · ' + s.id.slice(0, 8)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null
                  })}
                </select>
                {images.length > 0 && (
                  <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
                    {images.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => setParam('image', img.id)}
                        className={`rounded-md px-2.5 py-1 font-mono text-[11px] tracking-wider transition-colors ${
                          img.id === image?.id ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {viewLabel(img.view_type).toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {[
                  ['Overlay', overlay, () => setOverlay((v) => !v), Crosshair],
                  ['FDI labels', labels, () => setLabels((v) => !v), Hash],
                ].map(([label, on, toggle, Icon]) => (
                  <button
                    key={label}
                    onClick={toggle}
                    aria-pressed={on}
                    disabled={!hasResults}
                    className={`chip font-semibold transition-colors disabled:opacity-40 ${
                      on ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-400/40' : 'bg-white/[0.06] text-slate-400'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label.toUpperCase()}
                  </button>
                ))}
                {canReanalyze && image && (
                  <button
                    onClick={re.phase === 'review' ? () => setReDialog(true) : runReanalysis}
                    disabled={reBusy || (re.phase !== 'review' && (!image.ai_processed || image.ai_active))}
                    title={
                      re.phase === 'review'
                        ? 'Tinjau hasil analisis ulang yang menunggu keputusan'
                        : !image.ai_processed
                          ? 'Citra belum diproses AI — gunakan "Jalankan AI" di panel Tooth-level data'
                          : 'Jalankan ulang AI; hasil baru ditinjau dulu sebelum menggantikan hasil saat ini'
                    }
                    className="chip bg-signal-rose/15 font-semibold text-signal-rose ring-1 ring-signal-rose/30 transition-colors hover:bg-signal-rose/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {reBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    {reBusy ? 'MENGANALISIS…' : re.phase === 'review' ? 'TINJAU HASIL' : 'ANALISIS ULANG'}
                  </button>
                )}
                <a
                  href={image?.image_url || undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Buka citra ukuran penuh"
                  className={`rounded-lg bg-white/[0.06] p-2 text-slate-400 hover:text-slate-200 ${
                    image ? '' : 'pointer-events-none opacity-40'
                  }`}
                >
                  <Maximize2 className="h-4 w-4" />
                </a>
              </div>
            </header>

            {/* Status analisis ulang */}
            {(reBusy || re.phase === 'review' || re.phase === 'failed' || reNotice) && (
              <div className="divide-y divide-white/10 border-b border-white/10 text-[12.5px]">
                {reBusy && (
                  <div className="flex items-center gap-2 bg-signal-rose/10 px-5 py-2.5 text-rose-200">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    Analisis ulang sedang berjalan — hasil saat ini tetap ditampilkan sampai Anda memutuskan.
                  </div>
                )}
                {re.phase === 'review' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-400/10 px-5 py-2.5 text-amber-200">
                    <span>Hasil analisis ulang siap dan menunggu keputusan (Confirm / Reject).</span>
                    {canReanalyze && (
                      <button
                        onClick={() => setReDialog(true)}
                        className="chip bg-amber-400/20 font-semibold text-amber-100 ring-1 ring-amber-300/40 hover:bg-amber-400/30"
                      >
                        TINJAU
                      </button>
                    )}
                  </div>
                )}
                {re.phase === 'failed' && (
                  <div className="flex items-start justify-between gap-3 bg-signal-rose/10 px-5 py-2.5 text-rose-200">
                    <span>
                      <span className="font-semibold">Analisis ulang gagal, menampilkan hasil sebelumnya.</span>
                      {re.error && <span className="mt-0.5 block text-rose-300/80">{re.error}</span>}
                    </span>
                    {canReanalyze && (
                      <button
                        onClick={dismissFailedReanalysis}
                        className="rounded-md p-1 text-rose-300 hover:bg-white/10 hover:text-rose-100"
                        aria-label="Tutup pesan"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
                {reNotice && (
                  <div
                    className={`flex items-start justify-between gap-3 px-5 py-2.5 ${
                      reNotice.tone === 'success'
                        ? 'bg-teal-500/10 text-teal-200'
                        : reNotice.tone === 'error'
                          ? 'bg-signal-rose/10 text-rose-200'
                          : 'bg-white/[0.04] text-slate-300'
                    }`}
                  >
                    <span>
                      {reNotice.text}
                      {reNotice.pm && (
                        <>
                          {' '}
                          <button onClick={scrollToMatching} className="font-semibold text-teal-100 underline underline-offset-2">
                            Cari ulang kandidat AM →
                          </button>
                        </>
                      )}
                    </span>
                    <button
                      onClick={() => setReNotice(null)}
                      className="rounded-md p-1 opacity-70 hover:bg-white/10 hover:opacity-100"
                      aria-label="Tutup pesan"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Image + detections */}
            <div className="bg-viewer-900 p-6">
              {loading.subjects || loading.images ? (
                <div className="flex h-[340px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
                </div>
              ) : !image ? (
                <div className="flex h-[340px] flex-col items-center justify-center gap-3 text-center">
                  <ImageOff className="h-8 w-8 text-slate-600" />
                  <p className="max-w-[40ch] text-[13px] text-slate-400">
                    {subjects.length
                      ? 'Subjek ini belum memiliki citra.'
                      : 'Belum ada subjek.'}{' '}
                    Unggah citra lewat halaman Upload &amp; identify (PM) atau Data ante-mortem (AM, admin).
                  </p>
                  <Link to="/identify" className="chip bg-teal-500/20 font-semibold text-teal-200 ring-1 ring-teal-400/40">
                    <UploadCloud className="h-3 w-3" />
                    UPLOAD &amp; IDENTIFY
                  </Link>
                </div>
              ) : (
                <div className="relative mx-auto w-fit max-w-full">
                  <img
                    key={image.id}
                    src={image.image_url}
                    alt={`Citra ${viewLabel(image.view_type)} subjek ${subject?.full_name || ''}`}
                    onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    className="block max-h-[460px] max-w-full rounded-lg object-contain"
                  />
                  <ToothOverlay teeth={teeth} natural={natural} overlay={overlay} labels={labels} />
                </div>
              )}
            </div>

            {/* Stats derived from tooth_records */}
            <div className="grid grid-cols-1 gap-4 border-t border-white/10 bg-viewer-900 px-6 pb-6 pt-5 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="font-mono text-[11px] tracking-wider text-teal-400">GIGI TERDETEKSI</div>
                <div className="mt-2 font-mono text-[18px] font-semibold text-white">
                  {hasResults ? `${teeth.length} / ${FULL_DENTITION}` : '–'}
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  {hasResults
                    ? `${stats.withLandmarks} gigi dengan landmark · ${boxes.length || teeth.filter((t) => t.bbox).length} dengan bbox`
                    : 'Belum ada hasil AI untuk citra ini'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="font-mono text-[11px] tracking-wider text-signal-cyan">RATA-RATA CONFIDENCE</div>
                <div className="mt-2 font-mono text-[18px] font-semibold text-white">{pct(stats.avg)}</div>
                <div className="mt-1 text-[12px] text-slate-400">Deteksi per gigi, sudut {image ? viewLabel(image.view_type).toLowerCase() : '–'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="font-mono text-[11px] tracking-wider text-signal-amber">CONFIDENCE TERENDAH</div>
                <div className="mt-2 font-mono text-[18px] font-semibold text-signal-amber">
                  {stats.lowest ? `${pct(confValue(stats.lowest))} (FDI ${stats.lowest.fdi_number})` : '–'}
                </div>
                <div className="mt-1 text-[12px] text-slate-400">Kandidat untuk diperiksa ulang</div>
              </div>
            </div>
          </div>
        </section>

        {/* Data sidebar */}
        <aside className="space-y-6 xl:col-span-4">
          <section className="card p-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Confidence score</h2>
                <p className="mt-1 text-[12.5px] text-slate-500">Rata-rata deteksi gigi, citra ini</p>
              </div>
              <span className="font-mono text-[30px] font-semibold leading-none text-teal-700">{pct(stats.avg)}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${stats.avg ?? 0}%` }} />
            </div>
            <p className="mt-3 text-[12.5px] leading-snug text-slate-500">
              {hasResults
                ? `Dihitung dari ${teeth.length} gigi yang dideteksi model AI. Perbandingan dengan kandidat ante-mortem ada di bagian "Perbandingan morfologi" di bawah.`
                : 'Jalankan model AI pada citra ini untuk melihat skor.'}
            </p>
          </section>

          <section className="card p-6">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-700" />
              <h2 className="text-[15px] font-semibold text-ink">Tooth-level data</h2>
            </div>
            {loading.teeth ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              </div>
            ) : !hasResults ? (
              image ? (
                <div className="mt-4 space-y-3">
                  <p className="text-[12.5px] leading-snug text-slate-500">
                    Belum ada hasil deteksi untuk citra ini.{' '}
                    <span className="font-medium text-slate-700">
                      Status: {AI_STATUS_LABEL[image.ai_status] || AI_STATUS_LABEL.none}
                    </span>
                    {image.ai_status === 'completed' && ' — model tidak mendeteksi gigi pada citra ini.'}
                  </p>
                  {image.ai_status === 'failed' && image.ai_error_message && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{image.ai_error_message}</p>
                  )}
                  <RunAiButton image={image} canRun={canRunAi} onDone={refreshAfterAi} />
                  {!canRunAi && !isAiRunning(image.ai_status) && (
                    <p className="text-[12px] text-slate-400">
                      {user?.role === 'viewer'
                        ? 'Akun viewer hanya dapat melihat hasil.'
                        : 'Pemrosesan AI citra ante-mortem hanya dapat dijalankan admin.'}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-[12.5px] leading-snug text-slate-500">Pilih subjek dan citra terlebih dahulu.</p>
              )
            ) : (
              <dl className="mt-4 max-h-[420px] divide-y divide-slate-100 overflow-y-auto scroll-slim pr-1">
                {teeth.map((t) => {
                  const c = confValue(t)
                  const morph = t.morphology_features && typeof t.morphology_features === 'object'
                    ? Object.entries(t.morphology_features)
                    : []
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <dt className="text-[13.5px] font-medium text-ink">Gigi FDI {t.fdi_number}</dt>
                        <dd className="mt-0.5 truncate font-mono text-[11.5px] text-slate-400">
                          {morph.length
                            ? morph.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
                            : t.bbox
                              ? 'bbox tersedia · morfologi belum ada'
                              : 'tanpa bbox · morfologi belum ada'}
                        </dd>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-[15px] font-semibold ${
                          c != null && c < 85 ? 'text-signal-amber' : 'text-teal-700'
                        }`}
                      >
                        {pct(c)}
                      </span>
                    </div>
                  )
                })}
              </dl>
            )}
          </section>
        </aside>
      </div>

      <MorphologyComparison
        subject={subject}
        selectedId={matchParam}
        onSelect={(id) => setParam('match', id)}
        reloadKey={reloadKey}
        canRunMatching={['admin', 'examiner'].includes(user?.role)}
      />

      <ReanalysisDialog
        open={reDialog && !!re.jobId}
        jobId={re.jobId}
        imageUrl={image?.image_url}
        viewLabel={image ? viewLabel(image.view_type) : ''}
        onClose={() => setReDialog(false)}
        onDecided={onReanalysisDecided}
      />
    </div>
  )
}
