import { useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDot, Cpu, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import Dropzone from './Dropzone.jsx'
import DevicePickerDialog from './DevicePickerDialog.jsx'
import { fmtDateTime } from './DeviceCaptureCard.jsx'
import ViewPicker from './ViewPicker.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const DEVICE_ROLES = ['admin', 'examiner']

const STEPS = [
  { key: 'uploading', label: 'Mengunggah citra' },
  { key: 'pending', label: 'Menunggu antrean layanan AI' },
  { key: 'processing', label: 'Model AI mendeteksi gigi' },
]

/**
 * Angle picker + "Upload dari device" + dropzone + process/retry/reset buttons
 * + AI stepper + error box. Driven entirely by a `useDentalUpload()` result
 * passed as `upload`.
 *
 * @param {{ upload: ReturnType<typeof import('../lib/useDentalUpload.js').useDentalUpload>,
 *           allFilledHint?: string, subjectLabel?: string }} props
 */
export default function DentalUploadPanel({ upload: u, allFilledHint, subjectLabel }) {
  const { user } = useAuth()
  const [pickerOpen, setPickerOpen] = useState(false)
  const stepIndex = STEPS.findIndex((s) => s.key === u.phase)
  const cannotUpload = !u.file || u.busy || u.uploaded || u.allViewsFilled || u.filledViews.includes(u.viewType)
  const canUseDevice = DEVICE_ROLES.includes(user?.role)
  const deviceDisabled = !u.subjectId || u.busy || !!u.uploaded || u.allViewsFilled

  return (
    <>
      {/* Angle */}
      <div className="mt-4">
        <div className="text-[12.5px] font-medium text-slate-700">Sudut citra</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <ViewPicker
            value={u.viewType}
            onChange={u.setViewType}
            filled={u.filledViews}
            disabled={u.busy}
          />
          {canUseDevice && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={deviceDisabled}
              title={!u.subjectId ? 'Buat atau pilih subjek terlebih dahulu' : 'Ambil foto dari Inbox alat'}
              className="btn-ghost h-10 px-3.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Cpu className="h-4 w-4" />
              Upload dari device
            </button>
          )}
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
        {u.deviceCapture && (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12px] text-slate-500">
            <Cpu className="h-3.5 w-3.5 text-teal-600" />
            Foto dari device <span className="font-medium text-slate-700">{u.deviceCapture.device_name || u.deviceCapture.device_code}</span>
            · diambil {fmtDateTime(u.deviceCapture.captured_at || u.deviceCapture.received_at)}
            {!u.uploaded && <span>· tersimpan ke subjek saat diproses</span>}
          </p>
        )}
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
        {u.uploaded && (u.phase === 'failed' || u.phase === 'error') && (
          <button onClick={u.retryInference} className="btn-ghost h-11 px-5">
            <RotateCcw className="h-4 w-4" />
            Coba lagi proses AI
          </button>
        )}
        {(u.file || u.phase === 'done') && !u.busy && (
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

      {canUseDevice && (
        <DevicePickerDialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          upload={u}
          subjectLabel={subjectLabel}
        />
      )}
    </>
  )
}
