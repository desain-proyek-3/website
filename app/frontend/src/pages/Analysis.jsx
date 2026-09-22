import { useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Crosshair,
  Download,
  Hash,
  Lightbulb,
  Loader2,
  Maximize2,
  TriangleAlert,
} from 'lucide-react'
import { ACTIVITY_LOG, TOOTH_DATA } from '../lib/data.js'

const BANDS = ['Low', 'Med', 'High']

const LOG_STATUS = {
  complete: { cls: 'bg-teal-50 text-teal-700 ring-teal-200', Icon: CheckCircle2, text: 'Complete' },
  flagged: { cls: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: TriangleAlert, text: 'Flagged for review' },
  attention: { cls: 'bg-rose-50 text-rose-700 ring-rose-200', Icon: TriangleAlert, text: 'Needs re-scan' },
  running: { cls: 'bg-slate-100 text-slate-600 ring-slate-200', Icon: Loader2, text: 'Running' },
}

export default function Analysis() {
  const [intensity, setIntensity] = useState(62)
  const [overlay, setOverlay] = useState(true)
  const [labels, setLabels] = useState(false)

  const band = intensity < 34 ? 0 : intensity < 67 ? 1 : 2

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Viewport */}
        <section className="xl:col-span-8">
          <div className="card-dark overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="chip bg-signal-rose/15 font-semibold text-signal-rose ring-1 ring-signal-rose/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal-rose animate-pulseDot" />
                  LIVE ARCH MAPPING
                </span>
                <span className="font-mono text-[11.5px] text-slate-500">PM-0418 · PANORAMIC DATA</span>
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
                    className={`chip font-semibold transition-colors ${
                      on ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-400/40' : 'bg-white/[0.06] text-slate-400'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label.toUpperCase()}
                  </button>
                ))}
                <button
                  className="rounded-lg bg-white/[0.06] p-2 text-slate-400 hover:text-slate-200"
                  aria-label="Expand the viewport"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="p-6 bg-viewer-900 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-white/[0.04] p-4 border border-white/10">
                <div className="font-mono text-[11px] text-teal-400 tracking-wider">ARCH STATUS</div>
                <div className="mt-2 text-[18px] font-semibold text-white">ARCH TRACE LOCKED</div>
                <div className="mt-1 text-[12px] text-slate-400">32 landmarks detected at 0.02mm precision</div>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-4 border border-white/10">
                <div className="font-mono text-[11px] text-signal-cyan tracking-wider">MIDLINE CALIPER</div>
                <div className="mt-2 font-mono text-[18px] font-semibold text-white">+0.4 mm</div>
                <div className="mt-1 text-[12px] text-slate-400">Normal incisal alignment ratio</div>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-4 border border-white/10">
                <div className="font-mono text-[11px] text-signal-amber tracking-wider">FLAGGED ROTATION</div>
                <div className="mt-2 font-mono text-[18px] font-semibold text-signal-amber">12.4° (Tooth #26)</div>
                <div className="mt-1 text-[12px] text-slate-400">Posterior rotation deviation</div>
              </div>
            </div>

            {/* Distribution timeline */}
            <div className="border-t border-white/10 px-5 py-5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="dist" className="font-mono text-[10.5px] tracking-[.14em] text-slate-400">
                  PRESSURE / FEATURE DISTRIBUTION
                </label>
                <span className="font-mono text-[12px] text-teal-300">
                  {BANDS[band]} · {intensity}%
                </span>
              </div>
              <input
                id="dist"
                type="range"
                min="0"
                max="100"
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="slider-forensic mt-4 w-full"
              />
              <div className="mt-2.5 flex justify-between">
                {BANDS.map((b, i) => (
                  <button
                    key={b}
                    onClick={() => setIntensity([17, 50, 84][i])}
                    className={`font-mono text-[11px] tracking-[.1em] transition-colors ${
                      band === i ? 'text-teal-300' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {b.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="mt-3 max-w-[70ch] text-[12.5px] leading-snug text-slate-400">
                Moves the weighting of the match from anterior morphology toward posterior occlusal
                contact. At {BANDS[band].toLowerCase()} the engine leans on{' '}
                {band === 0 ? 'incisal edges and midline' : band === 1 ? 'premolar crowns and canine relation' : 'molar cusps and inter-arch pressure points'}.
              </p>
            </div>
          </div>
        </section>

        {/* Data sidebar */}
        <aside className="space-y-6 xl:col-span-4">
          <section className="card p-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Confidence score</h2>
                <p className="mt-1 text-[12.5px] text-slate-500">Feature-level agreement, this view</p>
              </div>
              <span className="font-mono text-[30px] font-semibold leading-none text-teal-700">95.4%</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-teal-600" style={{ width: '95.4%' }} />
            </div>
            <p className="mt-3 text-[12.5px] leading-snug text-slate-500">
              Lower than the case score of 98.4% because the right posterior segment is partly
              obscured on this film.
            </p>
          </section>

          <section className="card p-6">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-700" />
              <h2 className="text-[15px] font-semibold text-ink">Tooth-level data</h2>
            </div>
            <dl className="mt-4 divide-y divide-slate-100">
              {TOOTH_DATA.map((d) => (
                <div key={d.label} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <dt className="text-[13.5px] font-medium text-ink">{d.label}</dt>
                    <dd className="mt-0.5 font-mono text-[11.5px] text-slate-400">{d.ref}</dd>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[15px] font-semibold ${
                      d.state === 'review' ? 'text-signal-amber' : 'text-teal-700'
                    }`}
                  >
                    {d.value}
                  </span>
                </div>
              ))}
            </dl>
          </section>

          <section className="card border-teal-200 bg-teal-50/60 p-6">
            <div className="flex items-center gap-2 text-teal-800">
              <Lightbulb className="h-4 w-4" />
              <h2 className="text-[15px] font-semibold">What the engine recommends</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {[
                'Re-scan the right posterior segment with 15% more exposure before sign-off.',
                'Treat the overbite difference of 0.6 mm as post-mortem jaw drift, not a mismatch.',
                'Request the 2024 bitewing series from Klinik Sehat Palu to verify the #46 filling.',
              ].map((r, i) => (
                <li key={r} className="flex gap-3 text-[13.5px] leading-snug text-teal-900">
                  <span className="mt-0.5 font-mono text-[12px] text-teal-600">{String(i + 1).padStart(2, '0')}</span>
                  {r}
                </li>
              ))}
            </ul>
            <button className="btn-primary mt-5 h-10 w-full text-[13.5px]">Queue these actions</button>
          </section>
        </aside>
      </div>

      {/* Activity log */}
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">System activity log</h2>
            <p className="mt-1 text-[13px] text-slate-500">Everything the engine and the teams did on this case</p>
          </div>
          <button className="btn-ghost h-9 px-3.5 text-[12.5px]">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </header>

        <div className="scroll-slim overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {['Time', 'Record', 'Action', 'Detail', 'Operator', 'Status'].map((h) => (
                  <th key={h} className="px-6 py-3 font-mono text-[10.5px] font-medium tracking-[.12em] text-slate-500">
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ACTIVITY_LOG.map((row, i) => {
                const s = LOG_STATUS[row.status]
                return (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-6 py-3.5 font-mono text-[12.5px] text-slate-500">{row.time}</td>
                    <td className="whitespace-nowrap px-6 py-3.5 font-mono text-[12.5px] font-medium text-teal-700">
                      {row.record}
                    </td>
                    <td className="px-6 py-3.5 text-[13.5px] font-medium text-ink">{row.action}</td>
                    <td className="px-6 py-3.5 text-[12.5px] text-slate-500">{row.detail}</td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-[12.5px] text-slate-500">{row.operator}</td>
                    <td className="px-6 py-3.5">
                      <span className={`chip ring-1 ${s.cls}`}>
                        <s.Icon className={`h-3 w-3 ${row.status === 'running' ? 'animate-spin' : ''}`} />
                        {s.text}
                      </span>
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
