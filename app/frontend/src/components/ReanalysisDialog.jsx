import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { decideReanalysis, getReanalysis } from '../lib/api.js'
import ToothOverlay, { toothConfidence } from './ToothOverlay.jsx'

const FULL_DENTITION = 32

const avgConfidence = (teeth) => {
  const confs = teeth.map(toothConfidence).filter((c) => c != null)
  return confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null
}
const fmtPct = (v) => (v == null ? '–' : `${v.toFixed(1)}%`)

function OverlayImage({ src, teeth, alt }) {
  const [natural, setNatural] = useState(null)
  return (
    <div className="relative mx-auto w-fit max-w-full">
      <img
        src={src}
        alt={alt}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className="block max-h-[300px] max-w-full rounded-lg object-contain"
      />
      <ToothOverlay teeth={teeth} natural={natural} />
    </div>
  )
}

function FdiGroup({ label, fdis, cls }) {
  return (
    <div>
      <div className="font-mono text-[10.5px] tracking-[.12em] text-slate-500">
        {label.toUpperCase()} · {fdis.length}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {fdis.length ? (
          fdis.map((f) => (
            <span key={f} className={`chip font-mono ring-1 ${cls}`}>
              #{f}
            </span>
          ))
        ) : (
          <span className="text-[12px] text-slate-400">–</span>
        )}
      </div>
    </div>
  )
}

/**
 * Pop-up perbandingan hasil saat ini vs hasil analisis ulang + tombol Reject / Confirm.
 * Menutup tanpa memutuskan diperbolehkan — hasil tetap menunggu keputusan (banner "Tinjau").
 *
 * @param {{ open: boolean, jobId: string|null, imageUrl?: string, viewLabel?: string,
 *           onClose: () => void, onDecided: (review: 'confirmed'|'rejected', result: object) => void }} props
 */
export default function ReanalysisDialog({ open, jobId, imageUrl, viewLabel = '', onClose, onDecided }) {
  const titleId = useId()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('') // '' | 'confirm' | 'reject'
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !jobId) return
    const ctrl = new AbortController()
    setData(null)
    setLoadError('')
    setError('')
    getReanalysis(jobId, { signal: ctrl.signal })
      .then(setData)
      .catch((err) => err.name !== 'AbortError' && setLoadError(err.message))
    return () => ctrl.abort()
  }, [open, jobId])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const decide = async (decision) => {
    setBusy(decision)
    setError('')
    try {
      const result = await decideReanalysis(jobId, decision)
      onDecided(result.review, result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const pending = data?.review === 'pending'
  const s = data?.summary

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4 py-6"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card flex max-h-full w-full max-w-[960px] flex-col overflow-hidden shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-[16px] font-semibold text-ink">
              Hasil analisis ulang{viewLabel ? ` — sudut ${viewLabel.toLowerCase()}` : ''}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Bandingkan hasil saat ini dengan hasil baru. Hasil saat ini tidak berubah sampai Anda memilih Confirm.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={!!busy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            aria-label="Tutup (putuskan nanti)"
            title="Tutup — putuskan nanti"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 scroll-slim">
          {loadError ? (
            <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {loadError}
            </p>
          ) : !data ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            </div>
          ) : (
            <div className="space-y-5">
              {!pending && (
                <p className="rounded-xl bg-slate-100 px-4 py-3 text-[13px] text-slate-600">
                  Hasil analisis ulang ini sudah diputuskan ({data.review === 'confirmed' ? 'Confirm' : 'Reject'}).
                </p>
              )}
              {pending && data.confirmed_matches > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Subjek ini memiliki <b>{data.confirmed_matches}</b> pasangan PM–AM yang sudah dikonfirmasi.
                    Confirm akan mengubah data gigi yang dipakai laporan identifikasi INTERPOL pasangan tersebut.
                  </span>
                </p>
              )}

              {/* Ringkasan angka */}
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Gigi terdeteksi', `${s.current_count}`, `${s.proposed_count}`, `/ ${FULL_DENTITION}`],
                  ['Rata-rata confidence', fmtPct(avgConfidence(data.current)), fmtPct(avgConfidence(data.proposed)), ''],
                  ['Perubahan FDI', `+${s.added.length}`, `−${s.removed.length}`, `${s.kept.length} tetap`],
                ].map(([label, a, b, suffix], i) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                    <div className="font-mono text-[10.5px] tracking-[.12em] text-slate-500">{label.toUpperCase()}</div>
                    <div className="mt-1.5 font-mono text-[16px] font-semibold text-ink">
                      {i === 2 ? (
                        <>
                          <span className="text-teal-700">{a}</span> <span className="text-rose-600">{b}</span>
                        </>
                      ) : (
                        <>
                          {a} <span className="text-slate-400">→</span> <span className="text-teal-700">{b}</span>
                        </>
                      )}
                      {suffix && <span className="ml-1.5 text-[12px] font-normal text-slate-400">{suffix}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Citra sebelum vs sesudah */}
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ['Sebelum — hasil saat ini', data.current],
                  ['Sesudah — hasil analisis ulang', data.proposed],
                ].map(([label, teeth]) => (
                  <figure key={label} className="rounded-xl bg-viewer-900 p-3">
                    <figcaption className="mb-2 flex items-center justify-between font-mono text-[10.5px] tracking-[.12em] text-slate-400">
                      <span>{label.toUpperCase()}</span>
                      <span className="text-teal-300">{teeth.length} GIGI</span>
                    </figcaption>
                    {imageUrl ? (
                      <OverlayImage src={imageUrl} teeth={teeth} alt={label} />
                    ) : (
                      <p className="py-10 text-center text-[12px] text-slate-500">Citra tidak tersedia</p>
                    )}
                  </figure>
                ))}
              </div>

              {/* Daftar FDI */}
              <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
                <FdiGroup label="Baru terdeteksi" fdis={s.added} cls="bg-teal-50 text-teal-700 ring-teal-200" />
                <FdiGroup label="Hilang" fdis={s.removed} cls="bg-rose-50 text-rose-700 ring-rose-200" />
                <FdiGroup label="Tetap" fdis={s.kept} cls="bg-slate-50 text-slate-600 ring-slate-200" />
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4">
          <span className="mr-auto text-[12px] text-slate-400">
            Reject: pertahankan hasil saat ini · Confirm: ganti dengan hasil baru
          </span>
          <button
            onClick={() => decide('reject')}
            disabled={!pending || !!busy}
            className="btn-ghost h-10 px-4 text-[13px] text-rose-700 disabled:opacity-50"
          >
            {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Reject
          </button>
          <button
            onClick={() => decide('confirm')}
            disabled={!pending || !!busy}
            className="btn-primary h-10 px-4 text-[13px] disabled:opacity-50"
          >
            {busy === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirm
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
