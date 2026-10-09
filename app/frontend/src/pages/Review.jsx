import { useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Layers,
  MapPin,
  MessageSquareText,
  Network,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Undo2,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { usePosko } from '../context/PoskoContext.jsx'
import { FOLLOW_UP, REVIEW_QUEUE } from '../lib/data.js'

/* ─── Thresholds: ≥79% High, 50-78% Borderline, <50% Exclusion ─── */
const confidenceTone = (c) =>
  c >= 79
    ? {
        text: 'text-teal-700',
        bar: 'bg-teal-600',
        bg: 'bg-teal-50',
        ring: 'ring-teal-200',
        badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
        label: 'High Match Candidate (≥79%)',
        shortLabel: 'MATCH READY',
      }
    : c >= 50
    ? {
        text: 'text-amber-600',
        bar: 'bg-signal-amber',
        bg: 'bg-amber-50',
        ring: 'ring-amber-200',
        badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
        label: 'Borderline / Ambiguous (50–78%)',
        shortLabel: 'BORDERLINE',
      }
    : {
        text: 'text-rose-600',
        bar: 'bg-signal-rose',
        bg: 'bg-rose-50',
        ring: 'ring-rose-200',
        badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
        label: 'Definite Exclusion (<50%)',
        shortLabel: 'EXCLUDED',
      }

/* ─── Queue item ──────────────────────────────────────────────── */
function QueueItem({ r, isActive, decision, onClick }) {
  const t = confidenceTone(r.confidence)
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
        {/* Confidence score */}
        <div className="w-12 shrink-0 text-center">
          <span className={`block font-mono text-[15px] font-bold ${t.text}`}>
            {r.confidence}%
          </span>
          <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-400">
            {t.shortLabel}
          </span>
        </div>

        {/* Name + IDs */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{r.name}</span>
          <span className="block truncate font-mono text-[11px] text-slate-400">
            {r.id} ↔ {r.amRef}
          </span>
        </span>

        {/* Status badge */}
        <span
          className={[
            'chip shrink-0 text-[10px] font-semibold tracking-wider',
            decision === 'approved'
              ? 'bg-teal-600 text-white'
              : decision === 'rejected'
              ? 'bg-rose-500 text-white'
              : 'bg-slate-100 text-slate-500',
          ].join(' ')}
        >
          {decision ? decision.toUpperCase() : 'PENDING'}
        </span>
      </button>
    </li>
  )
}

/* ─── Page ────────────────────────────────────────────────────── */
export default function Review() {
  const { user } = useAuth()
  const { posko } = usePosko()

  const [activeId, setActiveId] = useState(REVIEW_QUEUE[0].id)
  const [decisions, setDecisions] = useState({})
  const [note, setNote] = useState('')

  const activeIdx = REVIEW_QUEUE.findIndex((r) => r.id === activeId)
  const active = REVIEW_QUEUE[activeIdx] || REVIEW_QUEUE[0]
  const decision = decisions[active.id]
  const tone = confidenceTone(active.confidence)
  const resolved = Object.keys(decisions).length
  const remaining = Math.max(REVIEW_QUEUE.length - resolved, 0)

  const decide = (verdict) => {
    setDecisions((d) => ({ ...d, [active.id]: verdict }))
    setNote('')
    // Auto-advance ke kandidat berikutnya yang masih pending
    const nextPending = REVIEW_QUEUE.find((r, i) => i > activeIdx && !decisions[r.id])
    if (nextPending) setActiveId(nextPending.id)
  }

  const goTo = (dir) => {
    const next = REVIEW_QUEUE[activeIdx + dir]
    if (next) setActiveId(next.id)
  }

  const pillars = active.pillars || {
    cnnScore: active.confidence,
    cnnNote: 'Visual feature extraction',
    rnnScore: active.confidence,
    rnnNote: 'Arch sequence alignment',
    ragScore: active.confidence,
    ragNote: 'Medical record correlation',
    contradiction: 'None detected',
    contradictionStatus: 'clear',
  }

  return (
    <div className="space-y-6">
      {/* ── Queue banner with Threshold Rules ───────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl bg-viewer-800 px-6 py-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-signal-amber/15 text-signal-amber">
          <BrainCircuit className="h-5 w-5" />
        </span>

        <div className="min-w-[240px] flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15.5px] font-semibold text-white">
              Validasi Pipeline AI (CNN + RNN + Agentic RAG)
            </p>
            <span className="rounded-full bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] text-teal-300">
              Threshold: ≥79% Match | 50–78% Borderline | &lt;50% Excluded
            </span>
          </div>
          <p className="mt-1 text-[13px] text-slate-400">
            {remaining} kasus menunggu validasi. Hasil didasarkan pada perbandingan fitur citra dan arsip ante-mortem.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <div className="font-mono text-[11px] tracking-[.12em] text-slate-500">TERVERIFIKASI</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-teal-300">{resolved}</div>
          </div>
          <div className="hidden h-10 w-px bg-white/10 sm:block" />
          <div className="hidden sm:block">
            <div className="font-mono text-[11px] tracking-[.12em] text-slate-500">
              PROGRESS {resolved}/{REVIEW_QUEUE.length}
            </div>
            <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-teal-400 transition-all duration-300"
                style={{ width: `${(resolved / REVIEW_QUEUE.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Left column: Active Subject & Review Execution */}
        <div className="space-y-5 xl:col-span-7">
          {/* Active Review Card */}
          <section className="card overflow-hidden">
            {/* Header: Score & Tier Banner */}
            <header className={`flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 ${tone.bg}`}>
              <div className="flex items-center gap-3">
                {active.confidence >= 79 ? (
                  <ShieldCheck className={`h-6 w-6 ${tone.text}`} />
                ) : active.confidence >= 50 ? (
                  <ShieldQuestion className={`h-6 w-6 ${tone.text}`} />
                ) : (
                  <ShieldAlert className={`h-6 w-6 ${tone.text}`} />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[16px] font-bold text-ink">Hasil Evaluasi AI</h2>
                    <span className={`rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-bold ${tone.badgeBg}`}>
                      {tone.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    Skor agregasi dari ensemble model visual dan perbandingan rekam medis
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className={`font-mono text-[30px] font-extrabold leading-none ${tone.text}`}>
                  {active.confidence}%
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-slate-500 tracking-wider">
                  CONFIDENCE SCORE
                </div>
              </div>
            </header>

            {/* Confidence Bar */}
            <div className="h-1.5 overflow-hidden bg-slate-100">
              <div
                className={`h-full ${tone.bar} transition-all duration-500`}
                style={{ width: `${active.confidence}%` }}
              />
            </div>

            <div className="px-6 pb-6 pt-5">
              {/* Subject Info */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-[20px] font-bold tracking-tight text-ink">{active.name}</h3>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
                    <span className="font-mono font-bold text-teal-700">{active.id} (PM)</span>
                    <span className="text-slate-300">↔</span>
                    <span className="font-mono font-bold text-slate-700">{active.amRef} (AM)</span>
                    {active.age && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>{active.age} thn</span>
                      </>
                    )}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-slate-500">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {active.recovered}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {active.flagged.map((t) => (
                    <span key={t} className="chip bg-viewer-800 font-semibold text-signal-cyan">
                      FDI {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── 4-Pillar AI Validation Breakdown (Poin No. 1) ── */}
              <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-teal-700" />
                    <span className="text-[12.5px] font-bold text-ink">
                      Rincian Validasi 3 Pilar AI &amp; Filter Kontradiksi
                    </span>
                  </div>
                  <span className="font-mono text-[10.5px] text-slate-400">ENSEMBLE DECOMPOSITION</span>
                </div>

                <div className="mt-3.5 space-y-3">
                  {/* Pillar 1: CNN */}
                  <div>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        <Layers className="h-3.5 w-3.5 text-teal-600" />
                        1. CNN Visual Morphology &amp; Bounding Box
                      </span>
                      <span className="font-mono font-bold text-ink">{pillars.cnnScore}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-teal-600" style={{ width: `${pillars.cnnScore}%` }} />
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-500">{pillars.cnnNote}</p>
                  </div>

                  {/* Pillar 2: RNN */}
                  <div>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        <Network className="h-3.5 w-3.5 text-teal-600" />
                        2. RNN Arch Alignment &amp; Tooth Sequence
                      </span>
                      <span className="font-mono font-bold text-ink">{pillars.rnnScore}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-teal-600" style={{ width: `${pillars.rnnScore}%` }} />
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-500">{pillars.rnnNote}</p>
                  </div>

                  {/* Pillar 3: Agentic RAG */}
                  <div>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        <BrainCircuit className="h-3.5 w-3.5 text-teal-600" />
                        3. Agentic RAG Clinical Chart Correlation
                      </span>
                      <span className="font-mono font-bold text-ink">{pillars.ragScore}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-teal-600" style={{ width: `${pillars.ragScore}%` }} />
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-500">{pillars.ragNote}</p>
                  </div>

                  {/* Fatal Contradiction Check */}
                  <div
                    className={`mt-2 rounded-lg border p-2.5 text-[12px] ${
                      pillars.contradictionStatus === 'danger'
                        ? 'border-rose-300 bg-rose-50 text-rose-800'
                        : pillars.contradictionStatus === 'warning'
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-teal-200 bg-teal-50 text-teal-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold">
                      {pillars.contradictionStatus === 'danger' ? (
                        <AlertOctagon className="h-3.5 w-3.5 text-rose-600" />
                      ) : pillars.contradictionStatus === 'warning' ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      ) : (
                        <Check className="h-3.5 w-3.5 text-teal-600" />
                      )}
                      <span>Pemeriksaan Kontradiksi Fatal:</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] opacity-90">{pillars.contradiction}</p>
                  </div>
                </div>
              </div>

              {/* Engine Summary Text */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  <span className="font-mono text-[10.5px] tracking-[.12em]">TEMUAN MESIN IDENTIFIKASI</span>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-700">{active.summary}</p>
              </div>

              {/* Decision Section */}
              {decision ? (
                <div
                  className={`mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4 ${
                    decision === 'approved' ? 'bg-teal-50 text-teal-800' : 'bg-rose-50 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-lg ${
                        decision === 'approved' ? 'bg-teal-200' : 'bg-rose-200'
                      }`}
                    >
                      {decision === 'approved' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-[14.5px] font-semibold">
                        {decision === 'approved' ? 'Kandidat Dikonfirmasi (Approved)' : 'Kandidat Ditolak / Dieliminasi (Rejected)'}
                      </p>
                      <p className="mt-0.5 text-[12px] opacity-75">
                        Diverifikasi oleh{' '}
                        <span className="font-semibold">{user?.name || user?.username || 'Petugas'}</span>
                        {' '}· tercatat di log audit sistem
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDecisions((d) => ({ ...d, [active.id]: undefined }))}
                      className="btn-ghost h-9 px-3.5 text-[12.5px]"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Batal
                    </button>
                    {REVIEW_QUEUE[activeIdx + 1] && (
                      <button
                        onClick={() => goTo(1)}
                        className="btn-ghost h-9 px-3.5 text-[12.5px] text-teal-700"
                      >
                        Berikutnya
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <label className="mt-5 block">
                    <span className="text-[13px] font-medium text-slate-600">
                      Catatan Validasi Petugas
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="Contoh: Morfologi insisivus sesuai; perbedaan fraktur dipastikan terjadi post-mortem."
                      className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3.5 text-[13.5px]
                                 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => decide('approved')}
                      className="btn-primary h-11 flex-1 px-5 sm:flex-none"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {active.confidence >= 79 ? 'KONFIRMASI MATCH (≥79%)' : 'SETUJUI KANDIDAT'}
                    </button>
                    <button
                      onClick={() => decide('rejected')}
                      className="btn h-11 flex-1 border border-rose-200 bg-white px-5 text-rose-600 hover:bg-rose-50 sm:flex-none"
                    >
                      <X className="h-4 w-4" />
                      {active.confidence < 50 ? 'KONFIRMASI ELIMINASI (<50%)' : 'TOLAK KANDIDAT'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Queue List */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h3 className="text-[14px] font-semibold text-ink">Daftar Antrean Kasus</h3>
                <p className="text-[11.5px] text-slate-400">Tersortir berdasarkan confidence score AI</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goTo(-1)}
                  disabled={activeIdx === 0}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 font-mono text-[12px] text-slate-400">
                  {activeIdx + 1} / {REVIEW_QUEUE.length}
                </span>
                <button
                  onClick={() => goTo(1)}
                  disabled={activeIdx === REVIEW_QUEUE.length - 1}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {REVIEW_QUEUE.map((r) => (
                <QueueItem
                  key={r.id}
                  r={r}
                  isActive={r.id === activeId}
                  decision={decisions[r.id]}
                  onClick={() => setActiveId(r.id)}
                />
              ))}
            </ul>
          </section>
        </div>

        {/* Right column: Scan Metadata & Follow-up */}
        <div className="space-y-5 xl:col-span-5">
          {/* Scan Metadata */}
          <section className="card-dark overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="text-[14.5px] font-semibold text-white">Metadata Citra &amp; Lokasi Temuan</h3>
                <p className="mt-0.5 font-mono text-[11px] tracking-[.1em] text-slate-400">
                  {active.id} · SPATIAL &amp; DENTAL SPECS
                </p>
              </div>
              <span className="chip bg-white/[0.06] text-slate-300">16 SEP · 08:12</span>
            </div>

            <dl className="divide-y divide-white/[0.07] p-5 text-[13px]">
              {[
                ['Record PM ID', <span className="font-mono font-semibold text-teal-300">{active.id}</span>],
                ['Kandidat AM Terkait', <span className="font-mono text-slate-200">{active.amRef}</span>],
                [
                  'Klasifikasi AI',
                  <span className={`font-mono font-bold ${tone.text}`}>
                    {tone.label}
                  </span>,
                ],
                ['Sektor Temuan', <span className="text-slate-200">{active.recovered}</span>],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-400">{label}</dt>
                  <dd>{val}</dd>
                </div>
              ))}

              <div className="pt-3">
                <dt className="mb-2 font-mono text-[10.5px] tracking-widest text-slate-500">
                  NODUS GIGI YANG DIANALISIS
                </dt>
                <dd className="flex flex-wrap gap-2">
                  {active.flagged.map((t) => (
                    <span
                      key={t}
                      className="chip bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30"
                    >
                      FDI #{t}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </section>

          {/* Follow-up Timeline */}
          <section className="card p-6">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-700" />
              <h3 className="text-[15px] font-semibold text-ink">Jadwal Rekonsiliasi Tim</h3>
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
