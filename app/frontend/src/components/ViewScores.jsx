import { AlertTriangle, History } from 'lucide-react'
import { VIEW_TYPES } from '../lib/api.js'

/**
 * Per-angle matching breakdown (backend per-view matching: PM angle X vs AM angle X,
 * overall score = mean of the compared angles). `views` = viewBreakdown(result).
 */

const rankCls = (rank) =>
  rank === 1 ? 'bg-teal-50 text-teal-700 ring-teal-200' : 'bg-slate-100 text-slate-600 ring-slate-200'

/** Compact "D #1 · Ki #1 · Ka #2" chips for lists (queue, candidate cards). */
export function ViewRankChips({ views, className = '' }) {
  if (views.legacy) {
    return <span className={`font-mono text-[10.5px] text-slate-400 ${className}`}>metode lama</span>
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {views.views.map((v) => (
        <span
          key={v.value}
          title={`${v.label}: cosine ${v.cos.toFixed(4)}, peringkat #${v.rank} di sudut ini`}
          className={`rounded px-1.5 py-px font-mono text-[10.5px] ring-1 ${rankCls(v.rank)}`}
        >
          {v.short} #{v.rank}
        </span>
      ))}
      {views.disagree && (
        <span title="Sudut tidak sepakat" aria-label="Sudut tidak sepakat">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        </span>
      )}
    </span>
  )
}

/** Full breakdown table: one row per angle (depan/kiri/kanan) + coverage, votes, disagreement. */
export default function ViewScores({ views, totalViews = VIEW_TYPES.length }) {
  if (views.legacy) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-slate-100/80 px-3 py-2 text-[12px] text-slate-600">
        <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
        Dihitung dengan metode lama (rata-rata embedding seluruh sudut), sehingga rincian per sudut tidak tersedia.
        Jalankan ulang pencocokan untuk subjek PM ini agar memakai perbandingan per sudut.
      </p>
    )
  }
  const byView = Object.fromEntries(views.views.map((v) => [v.value, v]))
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {VIEW_TYPES.map((t) => {
          const v = byView[t.value]
          return (
            <div key={t.value} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">{t.label}</div>
              {v ? (
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[13px] font-semibold text-ink">{v.cos.toFixed(4)}</span>
                  <span className={`rounded px-1.5 py-px font-mono text-[10.5px] ring-1 ${rankCls(v.rank)}`}>#{v.rank}</span>
                </div>
              ) : (
                <div className="mt-0.5 font-mono text-[12px] text-slate-400">tidak dibandingkan</div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-slate-500">
        {views.compared}/{totalViews} sudut dibandingkan · peringkat #1 di{' '}
        <span className="font-semibold text-ink">{views.votes}</span> dari {views.compared} sudut
      </p>
      {views.disagree && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          Sudut tidak sepakat: kandidat ini bukan peringkat #1 di semua sudut. Periksa citra sudut yang berbeda
          (kualitas, pencahayaan, atau sudut foto) sebelum memutuskan.
        </p>
      )}
    </div>
  )
}
