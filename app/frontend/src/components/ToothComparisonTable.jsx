import { TOOTH_STATUS } from '../lib/api.js'

const VIEW_SHORT = { depan: 'D', kiri: 'Ki', kanan: 'Ka' }

const fmtValue = (v) => {
  if (v == null) return '–'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '')
  if (typeof v === 'boolean') return v ? 'ya' : 'tidak'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

const fmtDelta = (d) => (d == null ? '' : `Δ ${d > 0 ? '+' : ''}${fmtValue(d)}`)

const fmtConf = (c) => (c == null ? '–' : `${c.toFixed(1)}%`)

function Side({ side }) {
  if (!side) return <span className="text-slate-300">tidak terdeteksi</span>
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono text-[12.5px] text-ink">{fmtConf(side.confidence)}</span>
      <span className="ml-1.5 font-mono text-[10.5px] text-slate-400" title={side.views.join(', ')}>
        {side.views.map((v) => VIEW_SHORT[v] || v).join('·')}
      </span>
    </span>
  )
}

/**
 * Summary chips + per-tooth table of a PM vs AM comparison
 * (GET /matching-results/{id}/comparison). Shared by Analysis and the report page.
 *
 * @param {{ comparison: object, onlyDifferences?: boolean }} props
 */
export default function ToothComparisonTable({ comparison, onlyDifferences = false }) {
  const { summary, teeth } = comparison
  const rows = onlyDifferences ? teeth.filter((t) => t.status !== 'consistent') : teeth

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(TOOTH_STATUS).map(([key, s]) => (
          <span key={key} className={`chip ring-1 ${s.cls}`}>
            {s.label}: <b className="ml-1">{summary[key]}</b>
          </span>
        ))}
        <span className="chip bg-white text-slate-600 ring-1 ring-slate-200">
          Fitur morfologi berbeda: <b className="ml-1">{summary.features_different}</b>/{summary.features_compared}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-slate-500">
          {teeth.length === 0
            ? 'Belum ada hasil deteksi gigi untuk dibandingkan — jalankan AI pada citra PM dan AM terlebih dahulu.'
            : 'Tidak ada perbedaan: seluruh gigi yang terdeteksi di kedua sisi konsisten.'}
        </p>
      ) : (
        <div className="scroll-slim mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                {['FDI', 'Status', 'PM', 'AM', 'Fitur morfologi (PM → AM)'].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-mono text-[10.5px] font-medium tracking-[.1em] text-slate-500">
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => {
                const s = TOOTH_STATUS[t.status]
                return (
                  <tr key={t.fdi_number} className="align-top">
                    <td className="px-3 py-2.5 font-mono text-[13px] font-semibold text-ink">{t.fdi_number}</td>
                    <td className="px-3 py-2.5">
                      <span className={`chip ring-1 ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5"><Side side={t.pm} /></td>
                    <td className="px-3 py-2.5"><Side side={t.am} /></td>
                    <td className="px-3 py-2.5">
                      {t.features.length === 0 ? (
                        <span className="text-[12px] text-slate-400">
                          {t.pm && t.am ? 'tidak ada data morfologi' : '–'}
                        </span>
                      ) : (
                        <ul className="space-y-0.5">
                          {t.features.map((f) => (
                            <li
                              key={f.feature}
                              className={`font-mono text-[11.5px] ${
                                f.status === 'different' ? 'font-semibold text-amber-700' : 'text-slate-500'
                              }`}
                            >
                              {f.feature}: {fmtValue(f.pm)} → {fmtValue(f.am)}{' '}
                              {f.status === 'different' && fmtDelta(f.delta)}
                              {f.status === 'pm_only' && '(hanya PM)'}
                              {f.status === 'am_only' && '(hanya AM)'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11.5px] leading-snug text-slate-400">
        Gigi dari 3 sudut citra digabung (deteksi dengan confidence tertinggi; D/Ki/Ka = sudut tempat gigi terdeteksi).
        Gigi yang tidak terdeteksi belum tentu tidak ada — interpretasi klinis tetap pada odontolog.
      </p>
    </div>
  )
}
