import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  ImageOff,
  Loader2,
  Lock,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  X,
} from 'lucide-react'
import SimBadge from '../components/SimBadge.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { usePosko } from '../context/PoskoContext.jsx'
import {
  MATCH_THRESHOLDS,
  MATCH_TIER_NOTE,
  VIEW_TYPES,
  confirmMatchingResult,
  getStatsSummary,
  listMatchingResults,
  listSubjectImages,
  matchTier,
} from '../lib/api.js'
import { FOLLOW_UP } from '../lib/data.js'

// Backend roles allowed to confirm/reject a match (POST /matching-results/{id}/confirm).
const DECIDE_ROLES = ['admin', 'examiner']
const QUEUE_FETCH_LIMIT = 100

const STATUS_TABS = [
  { value: 'pending_review', label: 'Menunggu review' },
  { value: 'confirmed', label: 'Dikonfirmasi' },
  { value: 'rejected', label: 'Ditolak' },
]

const { match: HIGH, review: BORDERLINE } = MATCH_THRESHOLDS

const TONES = {
  match: {
    text: 'text-teal-700',
    bar: 'bg-teal-600',
    bg: 'bg-teal-50',
    badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
    label: `High Match Candidate (≥${HIGH}%)`,
    shortLabel: 'MATCH READY',
    Icon: ShieldCheck,
  },
  review: {
    text: 'text-amber-600',
    bar: 'bg-signal-amber',
    bg: 'bg-amber-50',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
    label: `Borderline / Ambiguous (${BORDERLINE}–${HIGH - 1}%)`,
    shortLabel: 'BORDERLINE',
    Icon: ShieldQuestion,
  },
  conflict: {
    text: 'text-rose-600',
    bar: 'bg-signal-rose',
    bg: 'bg-rose-50',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
    label: `Definite Exclusion (<${BORDERLINE}%)`,
    shortLabel: 'EXCLUDED',
    Icon: ShieldAlert,
  },
}

const DECISION_CHIP = {
  confirmed: { cls: 'bg-teal-600 text-white', word: 'CONFIRMED' },
  rejected: { cls: 'bg-rose-500 text-white', word: 'REJECTED' },
  pending_review: { cls: 'bg-slate-100 text-slate-500', word: 'PENDING' },
}

const confidenceOf = (r) => (r.confidence_score == null ? 0 : r.confidence_score)
const subjectName = (s) => s?.full_name || 'Tanpa nama'
const shortId = (id) => id.slice(0, 8)
const fmtDate = (iso) =>
  new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

/* ─── Queue item ──────────────────────────────────────────────── */
function QueueItem({ r, isActive, onClick }) {
  const c = confidenceOf(r)
  const t = TONES[matchTier(c)]
  const chip = DECISION_CHIP[r.status]
  return (
    <li>
      <button
        onClick={onClick}
        className={[
          'flex w-full items-center gap-3.5 rounded-xl border px-3.5 py-3 text-left transition-all duration-150',
          isActive
            ? 'border-teal-600 bg-teal-50/70 shadow-sm'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
        ].join(' ')}
      >
        <div className="w-14 shrink-0 text-center">
          <span className={`block font-mono text-[15px] font-bold ${t.text}`}>{c.toFixed(1)}%</span>
          <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-400">{t.shortLabel}</span>
        </div>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">
            #{r.rank ?? '–'} · {subjectName(r.am_subject)}
          </span>
          <span className="block truncate font-mono text-[11px] text-slate-400">
            AM {shortId(r.am_subject_id)}
            {r.am_subject?.case_reference && ` · ${r.am_subject.case_reference}`}
          </span>
        </span>

        <span className={`chip shrink-0 text-[10px] font-semibold tracking-wider ${chip.cls}`}>{chip.word}</span>
      </button>
    </li>
  )
}

/* ─── Subject images (PM or AM) ───────────────────────────────── */
function SubjectImages({ tag, subject, images }) {
  const byView = Object.fromEntries((images?.items ?? []).map((img) => [img.view_type, img]))
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-ink">
          <span className={`mr-1.5 font-mono text-[11px] ${tag === 'PM' ? 'text-amber-600' : 'text-teal-700'}`}>{tag}</span>
          {subjectName(subject)}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-slate-400">{shortId(subject.id)}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {VIEW_TYPES.map((v) => {
          const img = byView[v.value]
          return (
            <figure key={v.value} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <div className="grid aspect-square place-items-center">
                {images == null ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                ) : img ? (
                  <a href={img.image_url} target="_blank" rel="noreferrer" className="block h-full w-full">
                    <img src={img.image_url} alt={`${tag} ${v.label}`} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <ImageOff className="h-4 w-4 text-slate-300" />
                )}
              </div>
              <figcaption className="border-t border-slate-200 py-1 text-center font-mono text-[10px] text-slate-500">
                {v.label.toUpperCase()}
              </figcaption>
            </figure>
          )
        })}
      </div>
      {images?.error && <p className="mt-1.5 text-[11.5px] text-rose-600">{images.error}</p>}
    </div>
  )
}

/* ─── Page ────────────────────────────────────────────────────── */
export default function Review() {
  const { user } = useAuth()
  const { posko } = usePosko()
  const canDecide = DECIDE_ROLES.includes(user?.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const pmFilter = searchParams.get('pm')

  const [statusTab, setStatusTab] = useState('pending_review')
  const [results, setResults] = useState(null) // { items, total }
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [images, setImages] = useState({}) // subjectId → null (loading) | { items, error? }
  const [deciding, setDeciding] = useState(false)
  const [decideError, setDecideError] = useState('')
  const [decidedHere, setDecidedHere] = useState({}) // resultId → reviewer name (this session)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [listRes, statsRes] = await Promise.allSettled([
      listMatchingResults({ status: statusTab, pmSubjectId: pmFilter || undefined, limit: QUEUE_FETCH_LIMIT }),
      getStatsSummary(),
    ])
    if (listRes.status === 'fulfilled') setResults(listRes.value)
    else setLoadError(listRes.reason?.message || 'Gagal memuat antrean review.')
    if (statsRes.status === 'fulfilled') setStats(statsRes.value)
    setLoading(false)
  }, [statusTab, pmFilter])

  useEffect(() => {
    load()
  }, [load])

  // Group per PM subject (strongest candidate first), candidates by rank inside.
  const groups = useMemo(() => {
    const byPm = new Map()
    for (const r of results?.items ?? []) {
      if (!byPm.has(r.pm_subject_id)) byPm.set(r.pm_subject_id, { pm: r.pm_subject, items: [] })
      byPm.get(r.pm_subject_id).items.push(r)
    }
    const list = [...byPm.values()]
    for (const g of list) g.items.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    return list.sort(
      (a, b) => Math.max(...b.items.map(confidenceOf)) - Math.max(...a.items.map(confidenceOf)),
    )
  }, [results])
  const queue = useMemo(() => groups.flatMap((g) => g.items), [groups])

  // Keep a valid selection when the list changes.
  useEffect(() => {
    if (!queue.length) setActiveId(null)
    else if (!queue.some((r) => r.id === activeId)) setActiveId(queue[0].id)
  }, [queue, activeId])

  const activeIdx = queue.findIndex((r) => r.id === activeId)
  const active = activeIdx >= 0 ? queue[activeIdx] : null

  // Load PM & AM images of the active pair (cached per subject).
  useEffect(() => {
    if (!active) return
    for (const id of [active.pm_subject_id, active.am_subject_id]) {
      if (id in images) continue
      setImages((m) => ({ ...m, [id]: null })) // null = loading
      listSubjectImages(id)
        .then((res) => setImages((m) => ({ ...m, [id]: res })))
        .catch((err) => setImages((m) => ({ ...m, [id]: { items: [], error: err.message } })))
    }
  }, [active, images])

  useEffect(() => setDecideError(''), [activeId])

  const goTo = (dir) => {
    const next = queue[activeIdx + dir]
    if (next) setActiveId(next.id)
  }

  const decide = async (decision) => {
    if (!active) return
    setDeciding(true)
    setDecideError('')
    try {
      const updated = await confirmMatchingResult(active.id, decision)
      setResults((prev) => ({
        ...prev,
        items: prev.items.map((r) => (r.id === updated.id ? updated : r)),
      }))
      setDecidedHere((m) => ({ ...m, [updated.id]: user?.full_name || user?.username || 'Petugas' }))
      getStatsSummary().then(setStats).catch(() => {})
      // Auto-advance to the next candidate still pending
      const nextPending = queue.find((r, i) => i > activeIdx && r.status === 'pending_review')
      if (nextPending) setActiveId(nextPending.id)
    } catch (err) {
      if (err.status === 409) {
        setDecideError(`${err.message}. Antrean dimuat ulang.`)
        load()
      } else if (err.status === 403) {
        setDecideError('Akun Anda tidak memiliki akses untuk memutuskan hasil pencocokan.')
      } else {
        setDecideError(err.message)
      }
    } finally {
      setDeciding(false)
    }
  }

  const clearPmFilter = () => {
    searchParams.delete('pm')
    setSearchParams(searchParams, { replace: true })
  }

  const matches = stats?.matching_results
  const resolved = matches ? matches.confirmed + matches.rejected : 0
  const totalPairs = matches ? resolved + matches.pending_review : 0
  const pmLabel = pmFilter && (queue[0]?.pm_subject_id === pmFilter ? subjectName(queue[0].pm_subject) : shortId(pmFilter))

  const confidence = active ? confidenceOf(active) : 0
  const tone = TONES[matchTier(confidence)]

  return (
    <div className="space-y-6">
      {/* ── Queue banner with Threshold Rules ───────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl bg-viewer-800 px-6 py-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-signal-amber/15 text-signal-amber">
          <BrainCircuit className="h-5 w-5" />
        </span>

        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15.5px] font-semibold text-white">Validasi Hasil Pencocokan AM ↔ PM</p>
            <span className="rounded-full bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] text-teal-300">
              Threshold: ≥{HIGH}% Match | {BORDERLINE}–{HIGH - 1}% Borderline | &lt;{BORDERLINE}% Excluded
            </span>
          </div>
          <p className="mt-1 text-[13px] text-slate-400">
            {matches ? `${matches.pending_review} kandidat menunggu validasi.` : 'Memuat ringkasan…'} Skor berasal
            dari kemiripan embedding citra intraoral (cosine similarity); keputusan akhir oleh odontolog.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <div className="font-mono text-[11px] tracking-[.12em] text-slate-500">TERVERIFIKASI</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-teal-300">{matches ? resolved : '–'}</div>
          </div>
          <div className="hidden h-10 w-px bg-white/10 sm:block" />
          <div className="hidden sm:block">
            <div className="font-mono text-[11px] tracking-[.12em] text-slate-500">
              PROGRESS {resolved}/{totalPairs}
            </div>
            <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-teal-400 transition-all duration-300"
                style={{ width: `${totalPairs ? (resolved / totalPairs) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatusTab(t.value)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
                statusTab === t.value ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-ink'
              }`}
            >
              {t.label}
              {matches && <span className="ml-1.5 font-mono text-[11px] text-slate-400">{matches[t.value]}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pmFilter && (
            <span className="chip bg-teal-50 text-teal-700 ring-1 ring-teal-200">
              Subjek PM: {pmLabel}
              <button onClick={clearPmFilter} aria-label="Hapus filter subjek" className="ml-1 hover:text-teal-900">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button onClick={load} disabled={loading} className="btn-ghost h-9 px-3 text-[12.5px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat ulang
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* ── Two-column layout ────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Left column: Active pair & decision */}
        <div className="space-y-5 xl:col-span-7">
          {!active ? (
            <section className="card flex min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              ) : (
                <>
                  <ShieldQuestion className="h-8 w-8 text-slate-300" />
                  <p className="max-w-[44ch] text-[13.5px] text-slate-500">
                    {statusTab === 'pending_review'
                      ? 'Tidak ada kandidat yang menunggu review. Jalankan pencarian kandidat AM di halaman Identify.'
                      : 'Belum ada hasil pencocokan dengan status ini.'}
                  </p>
                  {statusTab === 'pending_review' && (
                    <Link to="/identify" className="text-[13.5px] font-semibold text-teal-700 hover:text-teal-800">
                      Buka Identify
                    </Link>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="card overflow-hidden">
              {/* Header: Score & Tier Banner */}
              <header className={`flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 ${tone.bg}`}>
                <div className="flex items-center gap-3">
                  <tone.Icon className={`h-6 w-6 ${tone.text}`} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-bold text-ink">Hasil Pencocokan AI</h2>
                      <span className={`rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-bold ${tone.badgeBg}`}>
                        {tone.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      Kandidat peringkat #{active.rank ?? '–'} dari pencocokan 1:N subjek PM ini
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`font-mono text-[30px] font-extrabold leading-none ${tone.text}`}>
                    {confidence.toFixed(1)}%
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] tracking-wider text-slate-500">CONFIDENCE SCORE</div>
                </div>
              </header>

              {/* Confidence Bar */}
              <div className="h-1.5 overflow-hidden bg-slate-100">
                <div className={`h-full ${tone.bar} transition-all duration-500`} style={{ width: `${confidence}%` }} />
              </div>

              <div className="px-6 pb-6 pt-5">
                {/* Pair images */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <SubjectImages tag="PM" subject={active.pm_subject} images={images[active.pm_subject_id]} />
                  <SubjectImages tag="AM" subject={active.am_subject} images={images[active.am_subject_id]} />
                </div>

                {/* Score breakdown — only what the backend actually returns */}
                <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-teal-700" />
                      <span className="text-[12.5px] font-bold text-ink">Rincian Skor Pencocokan</span>
                    </div>
                    <span className="font-mono text-[10.5px] text-slate-400">PGVECTOR · COSINE</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px] sm:grid-cols-4">
                    {[
                      ['Cosine similarity', active.cosine_similarity == null ? '–' : active.cosine_similarity.toFixed(4)],
                      ['Peringkat 1:N', `#${active.rank ?? '–'}`],
                      ['Superimposition', active.superimposition_score ?? 'Belum tersedia'],
                      ['Selisih morfologi', active.morphology_diff_score ?? 'Belum tersedia'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[11.5px] text-slate-500">{k}</dt>
                        <dd className="mt-0.5 font-mono font-semibold text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[11.5px] text-slate-400">
                    Skor superimposition & morfologi menunggu output layanan AI; confidence = cosine × 100.
                  </p>
                </div>

                {/* Engine summary */}
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MessageSquareText className="h-3.5 w-3.5" />
                    <span className="font-mono text-[10.5px] tracking-[.12em]">INTERPRETASI SKOR</span>
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-700">
                    {MATCH_TIER_NOTE[matchTier(confidence)]}
                  </p>
                </div>

                {/* Decision Section */}
                {active.status !== 'pending_review' ? (
                  <div
                    className={`mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4 ${
                      active.status === 'confirmed' ? 'bg-teal-50 text-teal-800' : 'bg-rose-50 text-rose-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-lg ${
                          active.status === 'confirmed' ? 'bg-teal-200' : 'bg-rose-200'
                        }`}
                      >
                        {active.status === 'confirmed' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </span>
                      <div>
                        <p className="text-[14.5px] font-semibold">
                          {active.status === 'confirmed' ? 'Kandidat Dikonfirmasi' : 'Kandidat Ditolak / Dieliminasi'}
                        </p>
                        <p className="mt-0.5 text-[12px] opacity-75">
                          {decidedHere[active.id] ? (
                            <>
                              Diverifikasi oleh <span className="font-semibold">{decidedHere[active.id]}</span> ·{' '}
                            </>
                          ) : null}
                          Keputusan final, tercatat di log audit sistem
                        </p>
                      </div>
                    </div>
                    {queue[activeIdx + 1] && (
                      <button onClick={() => goTo(1)} className="btn-ghost h-9 px-3.5 text-[12.5px] text-teal-700">
                        Berikutnya
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ) : !canDecide ? (
                  <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <p className="text-[12.5px] text-slate-500">
                      Akses hanya-baca. Keputusan konfirmasi/penolakan hanya dapat dilakukan oleh examiner atau admin.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        onClick={() => decide('confirmed')}
                        disabled={deciding}
                        className="btn-primary h-11 flex-1 px-5 disabled:cursor-not-allowed sm:flex-none"
                      >
                        {deciding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {confidence >= HIGH ? `KONFIRMASI MATCH (≥${HIGH}%)` : 'SETUJUI KANDIDAT'}
                      </button>
                      <button
                        onClick={() => decide('rejected')}
                        disabled={deciding}
                        className="btn h-11 flex-1 border border-rose-200 bg-white px-5 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed sm:flex-none"
                      >
                        <X className="h-4 w-4" />
                        {confidence < BORDERLINE ? `KONFIRMASI ELIMINASI (<${BORDERLINE}%)` : 'TOLAK KANDIDAT'}
                      </button>
                    </div>
                    <p className="mt-2 text-[11.5px] text-slate-400">
                      Keputusan bersifat final dan tidak dapat dibatalkan dari halaman ini.
                    </p>
                  </>
                )}

                {decideError && (
                  <p className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-rose-600">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {decideError}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Queue List */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h3 className="text-[14px] font-semibold text-ink">Daftar Antrean Kasus</h3>
                <p className="text-[11.5px] text-slate-400">
                  Dikelompokkan per subjek PM, urut peringkat kandidat
                  {results && results.total > results.items.length &&
                    ` · ${results.items.length} dari ${results.total} terbaru`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goTo(-1)}
                  disabled={activeIdx <= 0}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 font-mono text-[12px] text-slate-400">
                  {queue.length ? activeIdx + 1 : 0} / {queue.length}
                </span>
                <button
                  onClick={() => goTo(1)}
                  disabled={activeIdx === -1 || activeIdx === queue.length - 1}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="px-1 py-4 text-[12.5px] text-slate-400">{loading ? 'Memuat…' : 'Antrean kosong.'}</p>
            ) : (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.pm.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
                      <span className="truncate text-[12.5px] font-semibold text-slate-700">
                        <span className="mr-1.5 font-mono text-[10.5px] text-amber-600">PM</span>
                        {subjectName(g.pm)}
                        {g.pm.case_reference && (
                          <span className="ml-1.5 font-normal text-slate-400">· {g.pm.case_reference}</span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] text-slate-400">
                        {fmtDate(g.items[0].created_at)}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {g.items.map((r) => (
                        <QueueItem key={r.id} r={r} isActive={r.id === activeId} onClick={() => setActiveId(r.id)} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column: Pair metadata & follow-up */}
        <div className="space-y-5 xl:col-span-5">
          {active && (
            <section className="card-dark overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h3 className="text-[14.5px] font-semibold text-white">Metadata Pasangan</h3>
                  <p className="mt-0.5 font-mono text-[11px] tracking-[.1em] text-slate-400">
                    MATCH {shortId(active.id)}
                  </p>
                </div>
                <span className="chip bg-white/[0.06] text-slate-300">{fmtDate(active.created_at)}</span>
              </div>

              <dl className="divide-y divide-white/[0.07] p-5 text-[13px]">
                {[
                  ['Subjek PM', <span className="font-mono font-semibold text-teal-300">{shortId(active.pm_subject_id)}</span>],
                  ['Referensi kasus PM', <span className="text-slate-200">{active.pm_subject?.case_reference || '–'}</span>],
                  ['Kandidat AM', <span className="font-mono text-slate-200">{shortId(active.am_subject_id)}</span>],
                  ['Referensi kasus AM', <span className="text-slate-200">{active.am_subject?.case_reference || '–'}</span>],
                  ['Klasifikasi skor', <span className={`font-mono font-bold ${tone.text}`}>{tone.shortLabel}</span>],
                  ['Status review', <span className="font-mono text-slate-200">{DECISION_CHIP[active.status].word}</span>],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="truncate">{val}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Follow-up Timeline — no backend entity yet */}
          <section className="card p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-teal-700" />
                <h3 className="text-[15px] font-semibold text-ink">Jadwal Rekonsiliasi Tim</h3>
              </div>
              <SimBadge />
            </div>
            <p className="mt-1 text-[12.5px] text-slate-500">
              Hari ini · <span className="font-medium text-slate-600">{posko}</span>
            </p>

            <ol className="mt-5 space-y-0">
              {FOLLOW_UP.map((f, i) => (
                <li key={f.time} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600" />
                    {i < FOLLOW_UP.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                  </div>

                  <div className="min-w-0 pb-5">
                    <div className="font-mono text-[12px] font-semibold text-teal-700">{f.time}</div>
                    <div className="mt-0.5 text-[13.5px] font-semibold text-ink">{f.title}</div>
                    <div className="mt-0.5 truncate text-[12px] text-slate-500">
                      {f.who} · <span className="text-slate-400">{f.place}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
