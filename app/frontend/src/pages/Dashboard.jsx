import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Cpu,
  Database,
  FileText,
  Filter,
  Layers,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react'
import RadialGauge from '../components/RadialGauge.jsx'
import MeterBar from '../components/MeterBar.jsx'
import SimBadge from '../components/SimBadge.jsx'
import {
  MATCH_THRESHOLDS,
  MATCH_TIER_NOTE,
  getStatsSummary,
  listMatchingResults,
  toCandidate,
} from '../lib/api.js'
import { AI_INSIGHTS, ACTIVITY_LOG, COMPARISON } from '../lib/data.js'

// Pending candidates fetched for the triage matrix (newest first).
const TRIAGE_FETCH_LIMIT = 100

/* ─── State style map ─────────────────────────────────────────── */
const STATE_STYLES = {
  match: { chip: 'bg-teal-50 text-teal-700 ring-teal-200', Icon: CheckCircle2, word: 'MATCH' },
  review: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: CircleDot, word: 'REVIEW' },
  conflict: { chip: 'bg-rose-50 text-rose-700 ring-rose-200', Icon: AlertTriangle, word: 'CONFLICT' },
}

const LOG_STATUS = {
  complete: { dot: 'bg-teal-500', text: 'text-teal-700', label: 'Done' },
  flagged: { dot: 'bg-signal-amber', text: 'text-amber-600', label: 'Flagged' },
  running: { dot: 'bg-signal-cyan animate-pulseDot', text: 'text-cyan-600', label: 'Running' },
  attention: { dot: 'bg-signal-rose', text: 'text-rose-600', label: 'Attention' },
}

// Keyed by matchTier() — same thresholds as Identify & Review.
const TIER_STYLES = {
  match: {
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    text: 'text-teal-700',
    label: `High Match (≥${MATCH_THRESHOLDS.match}%)`,
  },
  review: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    text: 'text-amber-600',
    label: `Borderline (${MATCH_THRESHOLDS.review}–${MATCH_THRESHOLDS.match - 1}%)`,
  },
  conflict: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    text: 'text-rose-600',
    label: `Excluded (<${MATCH_THRESHOLDS.review}%)`,
  },
}

const TIER_FILTERS = [
  { key: 'match', label: `High Match ≥${MATCH_THRESHOLDS.match}%`,
    on: 'bg-teal-700 text-white shadow-sm', off: 'border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100' },
  { key: 'review', label: `Borderline ${MATCH_THRESHOLDS.review}–${MATCH_THRESHOLDS.match - 1}%`,
    on: 'bg-signal-amber text-white shadow-sm', off: 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { key: 'conflict', label: `Excluded <${MATCH_THRESHOLDS.review}%`,
    on: 'bg-rose-600 text-white shadow-sm', off: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' },
]

const ratio = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)
const num = (v) => (v == null ? '–' : v)

/* ─── Stat Card ───────────────────────────────────────────────── */
function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="card group flex items-start gap-4 p-5 transition-shadow hover:shadow-lift">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-100">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-slate-500">{label}</div>
        <div className="mt-0.5 font-mono text-[22px] font-semibold leading-none text-ink">{value}</div>
        <div className="mt-1.5 truncate text-[12px] text-slate-400">{sub}</div>
      </div>
    </div>
  )
}

/* ─── AM / PM Scan Panel ──────────────────────────────────────── */
function ScanPanel({ data, tone }) {
  const isAM = data.tag === 'AM'
  return (
    <div className="card-dark overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={`chip font-bold tracking-widest ${tone}`}>{data.tag}</span>
          <div>
            <h4 className="text-[15px] font-semibold text-white">{data.title}</h4>
            <p className="mt-0.5 text-[12px] text-slate-400">{data.source}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10.5px] tracking-[.12em] text-slate-500">CAPTURED</div>
          <div className="mt-1 font-mono text-[13px] text-slate-300">{data.captured}</div>
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-white/10">
        {data.facts.map(([k, v]) => (
          <div key={k} className="px-4 py-3.5">
            <dt className="font-mono text-[10px] tracking-[.12em] text-slate-500">{k.toUpperCase()}</dt>
            <dd className="mt-1 text-[13px] font-semibold text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
        <span className="text-[12px] text-slate-400">
          Kualitas citra: <span className="text-slate-200">{data.quality}</span>
        </span>
        <span
          className={`h-2 w-2 rounded-full ${
            isAM ? 'bg-teal-400' : 'bg-signal-amber'
          } animate-pulseDot`}
        />
      </div>
    </div>
  )
}

/* ─── Activity Log Row ────────────────────────────────────────── */
function LogRow({ entry, isLast }) {
  const s = LOG_STATUS[entry.status] ?? LOG_STATUS.complete
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
        {!isLast && <span className="mt-1 w-px flex-1 bg-slate-100" />}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-4'}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-[13.5px] font-medium text-ink">{entry.action}</span>
          <span className="font-mono text-[11px] text-slate-400">{entry.time}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-slate-500">
          <span className="font-mono text-teal-700">{entry.record}</span>
          {' · '}
          {entry.detail}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-slate-400">
          <Zap className="h-3 w-3" />
          {entry.operator}
          <span className={`ml-1 font-mono text-[10px] font-semibold tracking-widest ${s.text}`}>
            {s.label.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─── Page ────────────────────────────────────────────────────── */
export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [pendingResults, setPendingResults] = useState(null) // { items, total }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterTier, setFilterTier] = useState('all')

  // Each source fails independently, so one broken request doesn't blank the page.
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [statsRes, pendingRes] = await Promise.allSettled([
      getStatsSummary(),
      listMatchingResults({ status: 'pending_review', limit: TRIAGE_FETCH_LIMIT }),
    ])
    if (statsRes.status === 'fulfilled') setStats(statsRes.value)
    if (pendingRes.status === 'fulfilled') setPendingResults(pendingRes.value)
    const failed = [statsRes, pendingRes].find((r) => r.status === 'rejected')
    if (failed) setError(failed.reason?.message || 'Gagal memuat data dashboard.')
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ── Derived metrics ──
  const subjects = stats?.subjects
  const embeddings = stats?.embeddings
  const jobs = stats?.inference_jobs
  const matches = stats?.matching_results
  const decided = matches ? matches.confirmed + matches.rejected : 0
  const totalPairs = matches ? decided + matches.pending_review : 0
  const totalJobs = jobs ? jobs.pending + jobs.processing + jobs.completed + jobs.failed : 0

  const meters = stats
    ? [
        {
          label: 'Subjek PM ber-embedding',
          value: ratio(embeddings.post_mortem, subjects.post_mortem),
          hint: `${embeddings.post_mortem} dari ${subjects.post_mortem} subjek PM siap dicocokkan`,
          tone: 'teal',
        },
        {
          label: 'Subjek AM ber-embedding',
          value: ratio(embeddings.ante_mortem, subjects.ante_mortem),
          hint: `${embeddings.ante_mortem} dari ${subjects.ante_mortem} subjek AM tersedia sebagai pembanding`,
          tone: 'teal',
        },
        {
          label: 'Job inferensi AI selesai',
          value: ratio(jobs.completed, totalJobs),
          hint: `${jobs.completed} selesai · ${jobs.failed} gagal · ${jobs.pending + jobs.processing} berjalan`,
          tone: jobs.failed > 0 ? 'amber' : 'teal',
        },
      ]
    : []

  const candidates = (pendingResults?.items ?? [])
    .map((r) => ({ ...toCandidate(r), pmSubjectId: r.pm_subject_id, pm: r.pm_subject, cosine: r.cosine_similarity }))
    .sort((a, b) => b.confidence - a.confidence)
  const tierCount = (tier) => candidates.filter((c) => c.status === tier).length
  const filteredCandidates = (
    filterTier === 'all' ? candidates : candidates.filter((c) => c.status === filterTier)
  ).slice(0, 3)

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Sebagian data dashboard gagal dimuat: {error}
          </p>
          <button onClick={load} disabled={loading} className="btn-ghost h-8 px-3 text-[12px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Coba lagi
          </button>
        </div>
      )}

      {/* ── Stat strip ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Database}
          label="Post-mortem records"
          value={num(subjects?.post_mortem)}
          sub={stats ? `${embeddings.post_mortem} ber-embedding · ${stats.dental_images} citra total` : 'Memuat…'}
        />
        <Stat
          icon={Users}
          label="Ante-mortem records"
          value={num(subjects?.ante_mortem)}
          sub={stats ? `${embeddings.ante_mortem} ber-embedding` : 'Memuat…'}
        />
        <Stat
          icon={Layers}
          label="Pasangan diputuskan"
          value={stats ? `${decided}/${totalPairs}` : '–'}
          sub={matches ? `${matches.confirmed} dikonfirmasi · ${matches.rejected} ditolak` : 'Memuat…'}
        />
        <Stat
          icon={AlertTriangle}
          label="Perlu Validasi Lanjutan"
          value={num(matches?.pending_review)}
          sub="kandidat menunggu keputusan odontolog"
        />
      </div>

      {/* ── Middle row: Matching progress + AI insights ─────────── */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Matching progress */}
        <section className="card p-6 xl:col-span-7">
          <header className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-ink">Progress Pencocokan AI</h2>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-700">
                  pgvector · cosine
                </span>
              </div>
              <p className="mt-1 text-[13px] text-slate-500">
                Dari {stats ? totalPairs : '–'} pasangan kandidat PM ↔ AM yang tersimpan
              </p>
            </div>
            <button onClick={load} disabled={loading} className="btn-ghost h-9 px-3 text-[12.5px]">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Muat ulang
            </button>
          </header>

          <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row sm:items-center">
            <div className="flex flex-col items-center gap-2">
              <RadialGauge
                value={ratio(decided, totalPairs)}
                pending={ratio(matches?.pending_review ?? 0, totalPairs)}
                label="pasangan diputuskan"
              />
              <p className="text-center text-[11.5px] text-slate-400">
                Teal: sudah diputuskan · Amber: menunggu review
              </p>
            </div>
            <div className="w-full flex-1 space-y-4">
              {stats ? (
                meters.map((m) => <MeterBar key={m.label} {...m} />)
              ) : (
                <p className="text-[13px] text-slate-400">{loading ? 'Memuat metrik…' : 'Metrik tidak tersedia.'}</p>
              )}
            </div>
          </div>

          {/* Legend with thresholds */}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-[12.5px] text-slate-500">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
              High Match Candidate (≥{MATCH_THRESHOLDS.match}%)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-signal-amber" />
              Borderline / Butuh Re-scan ({MATCH_THRESHOLDS.review}–{MATCH_THRESHOLDS.match - 1}%)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-signal-rose" />
              Auto-Excluded (&lt;{MATCH_THRESHOLDS.review}%)
            </span>
          </div>
        </section>

        {/* AI insights — waits for the Agentic RAG service */}
        <section className="card flex flex-col p-6 xl:col-span-5">
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-viewer-800 text-teal-300">
                <BrainCircuit className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-[17px] font-semibold text-ink">AI Ensemble Insights</h2>
                <p className="mt-0.5 font-mono text-[11px] tracking-[.1em] text-slate-400">
                  AGENTIC RAG · {AI_INSIGHTS.retrieved} SOURCES RETRIEVED
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <SimBadge />
              <div className="font-mono text-[26px] font-semibold leading-none text-teal-700">
                {AI_INSIGHTS.confidence}%
              </div>
              <div className="text-[11.5px] text-slate-400">confidence</div>
            </div>
          </header>

          <ul className="mt-5 flex-1 divide-y divide-slate-100">
            {AI_INSIGHTS.findings.map((f) => {
              const s = STATE_STYLES[f.state]
              return (
                <li key={f.key} className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-medium text-ink">{f.key}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px] text-slate-700">{f.value}</span>
                      <span className={`chip ring-1 ${s.chip}`}>
                        <s.Icon className="h-3 w-3" />
                        {s.word}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 max-w-[52ch] text-[12.5px] leading-snug text-slate-500">{f.note}</p>
                </li>
              )
            })}
          </ul>

          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-500">
              <FileText className="h-3.5 w-3.5" />
              <span className="font-mono text-[10.5px] tracking-[.12em]">EVIDENCE DARI ARSIP KLINIK</span>
            </div>
            <ul className="mt-2 space-y-1">
              {AI_INSIGHTS.sources.map((s) => (
                <li key={s} className="text-[12.5px] text-slate-600">
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <Link
            to="/review"
            className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-teal-700 hover:text-teal-800"
          >
            Buka halaman validasi kasus
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
      </div>

      {/* ── AI Candidate Triage Matrix — pending matching results ── */}
      <section className="card p-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <Cpu className="h-5 w-5 text-teal-700" />
              <h2 className="text-[17px] font-bold text-ink">Matriks Triase Kandidat AI (Top 3)</h2>
            </div>
            <p className="mt-1 text-[13px] text-slate-500">
              Kandidat AM yang menunggu review, diurutkan dari confidence tertinggi
              {pendingResults && pendingResults.total > pendingResults.items.length &&
                ` (dari ${pendingResults.items.length} kandidat terbaru, total ${pendingResults.total})`}
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-1 text-[12px] font-medium text-slate-400">
              <Filter className="h-3.5 w-3.5" /> Filter:
            </span>
            <button
              onClick={() => setFilterTier('all')}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                filterTier === 'all'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Semua ({candidates.length})
            </button>
            {TIER_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterTier(f.key)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                  filterTier === f.key ? f.on : f.off
                }`}
              >
                {f.label} ({tierCount(f.key)})
              </button>
            ))}
          </div>
        </header>

        {filteredCandidates.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[13px] text-slate-400">
            {loading
              ? 'Memuat kandidat…'
              : candidates.length === 0
                ? 'Belum ada kandidat yang menunggu review. Jalankan pencarian kandidat AM di halaman Identify.'
                : 'Tidak ada kandidat pada kategori ini.'}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCandidates.map((cand) => {
              const style = TIER_STYLES[cand.status]
              return (
                <div
                  key={cand.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-[15px] font-bold text-ink">{cand.name}</h4>
                        <div className="mt-0.5 truncate font-mono text-[11.5px] text-slate-500">
                          {cand.amId} ↔{' '}
                          <span className="font-bold text-teal-700">
                            {cand.pm?.full_name || cand.pmSubjectId.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`font-mono text-[20px] font-extrabold ${style.text}`}>
                          {cand.confidence.toFixed(1)}%
                        </div>
                        <span className={`mt-0.5 inline-block rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${style.badge}`}>
                          {style.label}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-center text-[11px]">
                      <div>
                        <span className="block font-mono text-[10px] text-slate-400">RANK</span>
                        <span className="font-mono font-bold text-slate-700">#{cand.rank ?? '–'}</span>
                      </div>
                      <div className="border-x border-slate-200">
                        <span className="block font-mono text-[10px] text-slate-400">COSINE</span>
                        <span className="font-mono font-bold text-slate-700">
                          {cand.cosine == null ? '–' : cand.cosine.toFixed(3)}
                        </span>
                      </div>
                      <div>
                        <span className="block font-mono text-[10px] text-slate-400">STATUS</span>
                        <span className="font-mono font-bold text-amber-600">PENDING</span>
                      </div>
                    </div>

                    <p className="mt-3 text-[12.5px] leading-snug text-slate-600">{MATCH_TIER_NOTE[cand.status]}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11.5px] text-slate-400">
                    <span className="truncate">{cand.pm?.case_reference || cand.caseReference || '–'}</span>
                    <Link
                      to={`/review?pm=${cand.pmSubjectId}`}
                      className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800"
                    >
                      Detail
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Bottom row: AM vs PM + Activity Log (simulated) ─────── */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* AM vs PM comparison — per-tooth comparison waits for the AI contract */}
        <section className="card p-6 xl:col-span-7">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-ink">Ante-mortem vs post-mortem</h2>
                <SimBadge />
              </div>
              <p className="mt-1 text-[13px] text-slate-500">
                Pasangan rekam medis <span className="font-mono text-teal-700">PM-0418 ↔ AM-2291</span>
                {' · '}skor evaluasi{' '}
                <span className="font-mono font-semibold text-teal-700">{AI_INSIGHTS.confidence}%</span>
              </p>
            </div>
            <Link to="/analysis" className="btn-ghost h-9 px-3.5 text-[12.5px]">
              Buka overlay visualizer
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </header>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <ScanPanel
              data={COMPARISON.am}
              tone="bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/30"
            />
            <ScanPanel
              data={COMPARISON.pm}
              tone="bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {COMPARISON.agreements.map((a) => {
              const s = STATE_STYLES[a.status]
              return (
                <span key={a.label} className={`chip ring-1 ${s.chip}`}>
                  <s.Icon className="h-3 w-3" />
                  {a.label}
                </span>
              )
            })}
          </div>
        </section>

        {/* Activity log */}
        <section className="card flex flex-col p-6 xl:col-span-5">
          <header className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-700" />
              <h2 className="text-[17px] font-semibold text-ink">Log Aktivitas Pipeline AI</h2>
            </div>
            <SimBadge />
          </header>

          <div className="flex-1 overflow-y-auto scroll-slim">
            {ACTIVITY_LOG.map((entry, i) => (
              <LogRow
                key={`${entry.record}-${entry.time}`}
                entry={entry}
                isLast={i === ACTIVITY_LOG.length - 1}
              />
            ))}
          </div>

          <Link
            to="/review"
            className="mt-5 inline-flex items-center gap-1.5 border-t border-slate-100 pt-4 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
          >
            Validasi kasus yang ditandai
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </div>
  )
}
