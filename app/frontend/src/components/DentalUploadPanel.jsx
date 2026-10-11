import { AlertTriangle, CheckCircle2, CircleDot, Loader2, RotateCcw, Sparkles, Upload } from 'lucide-react'
import Dropzone from './Dropzone.jsx'
import { VIEW_TYPES } from '../lib/api.js'

const STEPS = [
  { key: 'uploading', label: 'Mengunggah citra' },
  { key: 'pending', label: 'Menunggu antrean layanan AI' },
  { key: 'processing', label: 'Model AI mendeteksi gigi' },
]

/**
 * Angle picker + dropzone + process/retry/reset buttons + AI stepper + error box.
 * Driven entirely by a `useDentalUpload()` result passed as `upload`.
 *
 * `allowSkipAi` adds a TEMPORARY "Upload tanpa AI" button (stores the image only)
 * — remove once the AI service is live.
 *
 * @param {{ upload: ReturnType<typeof import('../lib/useDentalUpload.js').useDentalUpload>,
 *           allFilledHint?: string, allowSkipAi?: boolean }} props
 */
export default function DentalUploadPanel({ upload: u, allFilledHint, allowSkipAi = false }) {
  const stepIndex = STEPS.findIndex((s) => s.key === u.phase)
  const cannotUpload = !u.file || u.busy || u.uploaded || u.allViewsFilled || u.filledViews.includes(u.viewType)

  return (
    <>
      {/* Angle */}
      <div className="mt-4">
        <div className="text-[12.5px] font-medium text-slate-700">Sudut citra</div>
        <div className="mt-1.5 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {VIEW_TYPES.map((v) => {
            const filled = u.filledViews.includes(v.value)
            const active = u.viewType === v.value
            return (
              <button
                key={v.value}
                type="button"
                disabled={filled || u.busy}
                onClick={() => u.setViewType(v.value)}
                title={filled ? 'Sudut ini sudah memiliki citra' : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors
                  ${active && !filled ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'}
                  ${filled ? 'cursor-not-allowed text-slate-400' : 'hover:text-ink'}`}
              >
                {filled && <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />}
                {v.label}
              </button>
            )
          })}
        </div>
        {u.allViewsFilled && allFilledHint && <p className="mt-2 text-[12px] text-slate-500">{allFilledHint}</p>}
      </div>

      {/* Image */}
      <div className="mt-4">
        <Dropzone
          file={u.file}
          previewUrl={u.previewUrl}
          onSelect={u.selectFile}
          onClear={u.reset}
          disabled={u.busy}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={u.process}
          disabled={cannotUpload}
          className="btn-primary h-11 flex-1 px-5 disabled:cursor-not-allowed sm:flex-none"
        >
          {u.busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Memproses…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Proses dengan AI Model
            </>
          )}
        </button>
        {allowSkipAi && (
          <button
            onClick={u.uploadOnly}
            disabled={cannotUpload}
            title="Sementara: simpan citra tanpa menjalankan model AI (layanan AI belum terhubung)"
            className="btn-ghost h-11 px-5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Upload tanpa AI
          </button>
        )}
        {u.uploaded && (u.phase === 'failed' || u.phase === 'error') && (
          <button onClick={u.retryInference} className="btn-ghost h-11 px-5">
            <RotateCcw className="h-4 w-4" />
            Coba lagi proses AI
          </button>
        )}
        {u.uploaded && u.phase === 'uploaded' && (
          <button onClick={u.retryInference} className="btn-ghost h-11 px-5">
            <Sparkles className="h-4 w-4" />
            Jalankan AI untuk citra ini
          </button>
        )}
        {(u.file || u.phase === 'done' || u.phase === 'uploaded') && !u.busy && (
          <button onClick={u.reset} className="btn-ghost h-11 px-5">
            <RotateCcw className="h-4 w-4" />
            Reset Form
          </button>
        )}
      </div>

      {u.busy && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-slate-700">Proses AI sedang berjalan</span>
            <span className="font-mono text-[12.5px] text-slate-500">{u.elapsed} dtk</span>
          </div>
          <ol className="mt-3 space-y-2">
            {STEPS.map((s, i) => {
              const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo'
              return (
                <li key={s.key} className="flex items-center gap-2.5 text-[13px]">
                  {state === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  ) : state === 'active' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                  ) : (
                    <CircleDot className="h-4 w-4 text-slate-300" />
                  )}
                  <span className={state === 'todo' ? 'text-slate-400' : 'text-slate-700'}>{s.label}</span>
                </li>
              )
            })}
          </ol>
          <p className="mt-3 text-[12px] leading-snug text-slate-500">
            Citra dianalisis oleh model AI di server terpisah. Proses ini bisa memakan waktu
            hingga ±2 menit — halaman ini akan diperbarui otomatis, jangan ditutup.
          </p>
        </div>
      )}

      {(u.phase === 'error' || u.phase === 'failed') && (
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-rose-50 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <p className="text-[13.5px] font-semibold text-rose-800">
              {u.phase === 'failed' ? 'Inferensi AI gagal' : 'Proses gagal'}
            </p>
            <p className="mt-0.5 break-words text-[12.5px] text-rose-700">{u.errorMsg}</p>
          </div>
        </div>
      )}
    </>
  )
}
