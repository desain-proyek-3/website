import { useState } from 'react'
import {
  BellRing,
  CalendarClock,
  Check,
  MapPin,
  MessageSquareText,
  ShieldQuestion,
  Undo2,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { usePosko } from '../context/PoskoContext.jsx'
import { FOLLOW_UP, REVIEW_QUEUE } from '../lib/data.js'

const confidenceTone = (c) =>
  c >= 95
    ? { text: 'text-teal-700', bar: 'bg-teal-600', bg: 'bg-teal-50', label: 'High' }
    : c >= 85
    ? { text: 'text-amber-600', bar: 'bg-signal-amber', bg: 'bg-amber-50', label: 'Moderate' }
    : { text: 'text-rose-600', bar: 'bg-signal-rose', bg: 'bg-rose-50', label: 'Low' }

export default function Review() {
  const { user } = useAuth()
  const { posko } = usePosko()
  const [activeId, setActiveId] = useState(REVIEW_QUEUE[0].id)
  const [decisions, setDecisions] = useState({})
  const [note, setNote] = useState('')

  const active = REVIEW_QUEUE.find((r) => r.id === activeId)
  const decision = decisions[active.id]
  const tone = confidenceTone(active.confidence)
  const resolved = Object.keys(decisions).length
  const remaining = Math.max(14 - resolved, 0)

  const decide = (verdict) => {
    setDecisions((d) => ({ ...d, [active.id]: verdict }))
    setNote('')
  }

  return (
    <div className="space-y-6">
      {/* Queue banner */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl bg-viewer-800 px-6 py-5 text-slate-300">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-signal-amber/15 text-signal-amber">
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-[240px] flex-1">
          <p className="text-[15.5px] font-semibold text-white">
            {remaining} reviews pending AI confirmation today
          </p>
          <p className="mt-1 text-[13px] text-slate-400">
            Oldest has been open 6 hours. Matches above 95% still need a named odontologist to
            release them.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <div className="font-mono text-[11px] tracking-[.12em] text-slate-500">CLEARED TODAY</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-teal-300">{resolved}</div>
          </div>
          <div className="hidden h-10 w-px bg-white/10 sm:block" />
          <div>
            <div className="font-mono text-[11px] tracking-[.12em] text-slate-500">SECOND REVIEWER</div>
            <div className="mt-1 text-[13px] text-slate-300">drg. Hartono · on duty</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-7">
          {/* Review card */}
          <section className="card overflow-hidden">
            <header className={`flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 ${tone.bg}`}>
              <div className="flex items-center gap-3">
                <ShieldQuestion className={`h-5 w-5 ${tone.text}`} />
                <div>
                  <h2 className="text-[16px] font-semibold text-ink">AI review required</h2>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">
                    The engine reached a decision it is not allowed to release on its own.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono text-[28px] font-semibold leading-none ${tone.text}`}>
                  {active.confidence}%
                </div>
                <div className="mt-1 text-[11.5px] text-slate-500">{tone.label} confidence</div>
              </div>
            </header>

            <div className="px-6 pb-6 pt-5">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${active.confidence}%` }} />
              </div>

              <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-[20px] font-bold tracking-tight text-ink">{active.name}</h3>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
                    <span className="font-mono text-teal-700">{active.id}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono">{active.amRef}</span>
                    {active.age && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>{active.age} yrs</span>
                      </>
                    )}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-slate-500">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {active.recovered}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {active.flagged.map((t) => (
                    <span key={t} className="chip bg-viewer-800 font-semibold text-signal-cyan">
                      TOOTH {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  <span className="font-mono text-[10.5px] tracking-[.12em]">WHAT THE ENGINE FOUND</span>
                </div>
                <p className="mt-2.5 max-w-[68ch] text-[14px] leading-relaxed text-slate-700">
                  {active.summary}
                </p>
              </div>

              {decision ? (
                <div
                  className={`mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4 ${
                    decision === 'approved'
                      ? 'bg-teal-50 text-teal-800'
                      : 'bg-rose-50 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {decision === 'approved' ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                    <div>
                      <p className="text-[14.5px] font-semibold">
                        {decision === 'approved' ? 'Match approved' : 'Match rejected'}
                      </p>
                      <p className="mt-0.5 text-[12.5px] opacity-80">
                        Signed by {user?.name || 'Petugas Lapangan'} ({user?.role || 'Field Technician'}) · written to the case log
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDecisions((d) => ({ ...d, [active.id]: undefined }))}
                    className="btn-ghost h-9 px-3.5 text-[12.5px]"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                  </button>
                </div>
              ) : (
                <>
                  <label className="mt-5 block">
                    <span className="text-[13px] font-medium text-slate-600">
                      Reviewer note (attached to the decision)
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="e.g. Fracture on #25 consistent with crush injury; no contradiction found."
                      className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3.5 text-[13.5px]
                                 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={() => decide('approved')} className="btn-primary h-11 flex-1 px-5 sm:flex-none">
                      <Check className="h-4 w-4" />
                      APPROVE MATCH
                    </button>
                    <button
                      onClick={() => decide('rejected')}
                      className="btn h-11 flex-1 border border-rose-200 bg-white px-5 text-rose-600 hover:bg-rose-50 sm:flex-none"
                    >
                      <X className="h-4 w-4" />
                      REJECT MATCH
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Queue */}
          <section className="card p-5">
            <h3 className="px-1 text-[14px] font-semibold text-ink">Review queue</h3>
            <ul className="mt-3 space-y-2">
              {REVIEW_QUEUE.map((r) => {
                const t = confidenceTone(r.confidence)
                const isActive = r.id === activeId
                const d = decisions[r.id]
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setActiveId(r.id)}
                      className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                        isActive
                          ? 'border-teal-600 bg-teal-50/60'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className={`font-mono text-[15px] font-semibold ${t.text}`}>{r.confidence}%</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{r.name}</span>
                        <span className="block truncate font-mono text-[11.5px] text-slate-400">
                          {r.id} ↔ {r.amRef}
                        </span>
                      </span>
                      <span
                        className={`chip ${
                          d === 'approved'
                            ? 'bg-teal-600 text-white'
                            : d === 'rejected'
                            ? 'bg-rose-500 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {d ? d.toUpperCase() : 'PENDING'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6 xl:col-span-5">
          <section className="card-dark overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-[14.5px] font-semibold text-white">Post-mortem scan metadata</h3>
                <p className="mt-0.5 font-mono text-[11px] tracking-[.1em] text-slate-500">
                  {active.id} · RECORD DETAILS
                </p>
              </div>
              <span className="chip bg-white/[0.06] text-slate-300">16 SEP · 08:12</span>
            </div>
            <div className="p-5 space-y-4 text-[13px] text-slate-300">
              <div className="flex justify-between border-b border-white/10 pb-2.5">
                <span className="text-slate-400">Record ID</span>
                <span className="font-mono text-teal-300 font-semibold">{active.id}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2.5">
                <span className="text-slate-400">AM Reference</span>
                <span className="font-mono text-slate-200">{active.amRef}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2.5">
                <span className="text-slate-400">Confidence Score</span>
                <span className="font-mono text-teal-300 font-semibold">{active.confidence}%</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2.5">
                <span className="text-slate-400">Recovery Site</span>
                <span className="text-slate-200">{active.recovered}</span>
              </div>
              <div>
                <span className="block text-slate-400 text-[12px] mb-2 font-mono tracking-wider">FLAGGED TEETH NODES</span>
                <div className="flex flex-wrap gap-2">
                  {active.flagged.map((t) => (
                    <span key={t} className="chip bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30">
                      TOOTH #{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="card p-6">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-700" />
              <h3 className="text-[15px] font-semibold text-ink">Forensic team follow-up</h3>
            </div>
            <p className="mt-1 text-[12.5px] text-slate-500">Hari ini · {posko}</p>

            <ol className="mt-5 space-y-0">
              {FOLLOW_UP.map((f, i) => (
                <li key={f.time} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-teal-600" />
                    {i < FOLLOW_UP.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                  </div>
                  <div className="pb-5">
                    <div className="font-mono text-[12px] text-teal-700">{f.time}</div>
                    <div className="mt-0.5 text-[13.5px] font-medium text-ink">{f.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-slate-500">
                      {f.who} · {f.place}
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
