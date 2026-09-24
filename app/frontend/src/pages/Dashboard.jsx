import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Database,
  FileText,
  Layers,
  RefreshCw,
  Users,
} from 'lucide-react'
import RadialGauge from '../components/RadialGauge.jsx'
import MeterBar from '../components/MeterBar.jsx'
import { AI_INSIGHTS, CASE, COMPARISON, MATCH_PROGRESS } from '../lib/data.js'

const STATE_STYLES = {
  match: { chip: 'bg-teal-50 text-teal-700 ring-teal-200', Icon: CheckCircle2, word: 'MATCH' },
  review: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: CircleDot, word: 'REVIEW' },
  conflict: { chip: 'bg-rose-50 text-rose-700 ring-rose-200', Icon: AlertTriangle, word: 'CONFLICT' },
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="card flex items-start gap-4 p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] text-slate-500">{label}</div>
        <div className="mt-0.5 font-mono text-[22px] font-semibold leading-none text-ink">{value}</div>
        <div className="mt-1.5 truncate text-[12px] text-slate-400">{sub}</div>
      </div>
    </div>
  )
}

function ScanPanel({ data, record, tone }) {
  return (
    <div className="card-dark overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`chip font-semibold ${tone}`}>{data.tag}</span>
            <h4 className="text-[15px] font-semibold text-white">{data.title}</h4>
          </div>
          <p className="mt-1.5 text-[12.5px] text-slate-400">{data.source}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] tracking-[.12em] text-slate-500">CAPTURED</div>
          <div className="mt-1 font-mono text-[12.5px] text-slate-300">{data.captured}</div>
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
        {data.facts.map(([k, v]) => (
          <div key={k} className="px-4 py-3.5">
            <dt className="font-mono text-[10px] tracking-[.12em] text-slate-500">{k.toUpperCase()}</dt>
            <dd className="mt-1 text-[13px] font-medium text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-white/10 px-4 py-3 text-[12px] text-slate-400">
        Image quality: <span className="text-slate-200">{data.quality}</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { completed, pending, pairsResolved, pairsTotal, meters } = MATCH_PROGRESS

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Database} label="Post-mortem records" value={CASE.pmRecords} sub="312 scanned · 0 queued" />
        <Stat icon={Users} label="Ante-mortem records" value={CASE.amRecords} sub="from 41 clinics" />
        <Stat icon={Layers} label="Pairs resolved" value={`${pairsResolved}/${pairsTotal}`} sub="8 still open" />
        <Stat icon={AlertTriangle} label="Waiting on a reviewer" value="14" sub="oldest opened 6 hrs ago" />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Matching progress */}
        <section className="card p-6 xl:col-span-7">
          <header className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-semibold text-ink">Matching progress</h2>
              <p className="mt-1 text-[13px] text-slate-500">
                Across {pairsTotal} candidate pairs in {CASE.id}
              </p>
            </div>
            <button className="btn-ghost h-9 px-3 text-[12.5px]">
              <RefreshCw className="h-3.5 w-3.5" />
              Re-run
            </button>
          </header>

          <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row sm:items-center">
            <RadialGauge value={completed} pending={pending} label="match completed" />
            <div className="w-full flex-1 space-y-5">
              {meters.map((m) => (
                <MeterBar key={m.label} {...m} />
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-[12.5px] text-slate-500">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> Confirmed by a reviewer
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-signal-amber" /> Awaiting confirmation
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" /> No candidate yet
            </span>
          </div>
        </section>

        {/* AI insights */}
        <section className="card flex flex-col p-6 xl:col-span-5">
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-viewer-800 text-teal-300">
                <BrainCircuit className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-[17px] font-semibold text-ink">AI insights</h2>
                <p className="mt-0.5 font-mono text-[11px] tracking-[.1em] text-slate-400">
                  AGENTIC RAG · {AI_INSIGHTS.retrieved} SOURCES
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[26px] font-semibold leading-none text-teal-700">
                {AI_INSIGHTS.confidence}%
              </div>
              <div className="mt-1 text-[11.5px] text-slate-400">confidence</div>
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
              <span className="font-mono text-[10.5px] tracking-[.12em]">RETRIEVED EVIDENCE</span>
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
            Send to forensic review
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
      </div>

      {/* AM vs PM */}
      <section className="card p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Ante-mortem vs post-mortem</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Record pair PM-0418 ↔ AM-2291 · scored {AI_INSIGHTS.confidence}%
            </p>
          </div>
          <Link to="/analysis" className="btn-ghost h-9 px-3.5 text-[12.5px]">
            Open overlay visualizer
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <ScanPanel data={COMPARISON.am} record="am" tone="bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/30" />
          <ScanPanel data={COMPARISON.pm} record="pm" tone="bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30" />
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
    </div>
  )
}
