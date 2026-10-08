import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Download,
  FlaskConical,
  Hash,
  ImageOff,
  Lightbulb,
  Loader2,
  Maximize2,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react'
import {
  VIEW_TYPES,
  bboxToPixels,
  getDentalImage,
  getToothRecords,
  listSubjectImages,
  listSubjects,
} from '../lib/api.js'
import { ACTIVITY_LOG } from '../lib/data.js'
import { useAuth } from '../context/AuthContext.jsx'

const BANDS = ['Low', 'Med', 'High']
const FULL_DENTITION = 32
// Roles allowed to see the audit-backed activity log (GET /audit is admin/examiner).
const LOG_ROLES = ['admin', 'examiner']

const LOG_STATUS = {
  complete: { cls: 'bg-teal-50 text-teal-700 ring-teal-200', Icon: CheckCircle2, text: 'Complete' },
  flagged: { cls: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: TriangleAlert, text: 'Flagged for review' },
  attention: { cls: 'bg-rose-50 text-rose-700 ring-rose-200', Icon: TriangleAlert, text: 'Needs re-scan' },
  running: { cls: 'bg-slate-100 text-slate-600 ring-slate-200', Icon: Loader2, text: 'Running' },
}

function SimBadge({ dark = false }) {
  return (
    <span
      className={`chip whitespace-nowrap ring-1 ${
        dark ? 'bg-signal-amber/15 text-signal-amber ring-signal-amber/30' : 'bg-amber-50 text-amber-700 ring-amber-200'
      }`}
    >
      <FlaskConical className="h-3 w-3" />
      DATA SIMULASI
    </span>
  )
}

const pct = (v) => (v == null ? '–' : `${(v <= 1 ? v * 100 : v).toFixed(1)}%`)
const confValue = (t) => (t.confidence_score == null ? null : t.confidence_score <= 1 ? t.confidence_score * 100 : t.confidence_score)
const viewLabel = (v) => VIEW_TYPES.find((x) => x.value === v)?.label || v

const darkSelect =
  'h-8 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 font-mono text-[11.5px] text-slate-200 ' +
  'focus:border-teal-400 focus:outline-none'

export default function Analysis() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const imageParam = searchParams.get('image')

  const [intensity, setIntensity] = useState(62)
  const [overlay, setOverlay] = useState(true)
  const [labels, setLabels] = useState(true)

  const [subjects, setSubjects] = useState([])
  const [subjectId, setSubjectId] = useState('')
  const [images, setImages] = useState([])
  const [teeth, setTeeth] = useState([])
  const [natural, setNatural] = useState(null) // { w, h } of the loaded image
  const [loading, setLoading] = useState({ subjects: true, images: false, teeth: false })
  const [error, setError] = useState('')

  const image = images.find((i) => i.id === imageParam) || null

  // 1. PM + AM subjects; if ?image= is given, resolve its subject first.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { items } = await listSubjects()
        if (cancelled) return
        setSubjects(items)
        if (imageParam) {
          const img = await getDentalImage(imageParam)
          if (!cancelled) setSubjectId(img.subject_id)
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
        if (!sorted.some((i) => i.id === current)) {
          setSearchParams(sorted[0] ? { image: sorted[0].id } : {}, { replace: true })
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading((l) => ({ ...l, images: false })))
    return () => {
      cancelled = true
    }
  }, [subjectId, setSearchParams])

  // 3. Tooth records of the selected image.
  useEffect(() => {
    setTeeth([])
    setNatural(null)
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
  }, [image?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const band = intensity < 34 ? 0 : intensity < 67 ? 1 : 2
  const strokeW = natural ? Math.max(natural.w, natural.h) / 400 : 1

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
                        onClick={() => setSearchParams({ image: img.id }, { replace: true })}
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
                  {natural && (overlay || labels) && boxes.length > 0 && (
                    <svg
                      viewBox={`0 0 ${natural.w} ${natural.h}`}
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      aria-hidden="true"
                    >
                      {boxes.map(({ t, box }) => {
                        const low = confValue(t) != null && confValue(t) < 85
                        const color = low ? '#f5b544' : '#2dd4bf'
                        return (
                          <g key={t.id}>
                            {overlay && (
                              <rect
                                x={box.x}
                                y={box.y}
                                width={box.w}
                                height={box.h}
                                fill={color}
                                fillOpacity="0.08"
                                stroke={color}
                                strokeWidth={strokeW}
                                rx={strokeW * 2}
                              />
                            )}
                            {labels && (
                              <text
                                x={box.x + strokeW * 2}
                                y={box.y - strokeW * 3}
                                fill={color}
                                fontSize={strokeW * 11}
                                fontFamily="ui-monospace, monospace"
                                fontWeight="600"
                              >
                                {t.fdi_number}
                              </text>
                            )}
                          </g>
                        )
                      })}
                    </svg>
                  )}
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

            {/* Distribution timeline — no backend yet */}
            <div className="border-t border-white/10 px-5 py-5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="dist" className="font-mono text-[10.5px] tracking-[.14em] text-slate-400">
                  PRESSURE / FEATURE DISTRIBUTION
                </label>
                <div className="flex items-center gap-2">
                  <SimBadge dark />
                  <span className="font-mono text-[12px] text-teal-300">
                    {BANDS[band]} · {intensity}%
                  </span>
                </div>
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
                <p className="mt-1 text-[12.5px] text-slate-500">Rata-rata deteksi gigi, citra ini</p>
              </div>
              <span className="font-mono text-[30px] font-semibold leading-none text-teal-700">{pct(stats.avg)}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${stats.avg ?? 0}%` }} />
            </div>
            <p className="mt-3 text-[12.5px] leading-snug text-slate-500">
              {hasResults
                ? `Dihitung dari ${teeth.length} gigi yang dideteksi model AI. Skor kecocokan dengan data ante-mortem belum tersedia (endpoint matching menyusul).`
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
              <p className="mt-4 text-[12.5px] leading-snug text-slate-500">
                {image ? (
                  <>
                    Belum ada hasil deteksi untuk citra ini — citra belum diproses AI atau inferensinya gagal.{' '}
                    <Link to="/identify" className="font-semibold text-teal-700 hover:text-teal-800">
                      Proses di Upload &amp; identify
                    </Link>
                  </>
                ) : (
                  'Pilih subjek dan citra terlebih dahulu.'
                )}
              </p>
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

          <section className="card border-teal-200 bg-teal-50/60 p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-teal-800">
                <Lightbulb className="h-4 w-4" />
                <h2 className="text-[15px] font-semibold">What the engine recommends</h2>
              </div>
              <SimBadge />
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

      {/* Activity log — mock; real source would be GET /audit (admin/examiner only) */}
      {LOG_ROLES.includes(user?.role) && (
        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-ink">System activity log</h2>
                <SimBadge />
              </div>
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
      )}
    </div>
  )
}
