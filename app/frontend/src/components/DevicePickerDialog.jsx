import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react'
import Modal from './Modal.jsx'
import DeviceCaptureCard from './DeviceCaptureCard.jsx'
import ViewPicker, { firstFreeView } from './ViewPicker.jsx'
import { fetchDeviceCaptureFile, listDeviceCaptures } from '../lib/api.js'

/**
 * "Upload dari device": pick a pending Inbox photo + angle for the ACTIVE
 * subject of a useDentalUpload() flow. The photo is downloaded and placed in
 * the normal preview; nothing is saved until the user presses "Proses".
 *
 * @param {{ open: boolean, onClose: () => void,
 *           upload: ReturnType<typeof import('../lib/useDentalUpload.js').useDentalUpload>,
 *           subjectLabel?: string }} props
 */
export default function DevicePickerDialog({ open, onClose, upload: u, subjectLabel }) {
  const [captures, setCaptures] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { items } = await listDeviceCaptures({ limit: 60 })
      setCaptures(items)
      setSelectedId((prev) => (items.some((c) => c.id === prev) ? prev : null))
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setSelectedId(null)
    setError('')
    setView(firstFreeView(u.filledViews, u.viewType))
    load()
    // only when the dialog opens
  }, [open, load])

  const selected = captures.find((c) => c.id === selectedId) || null

  const pick = (c) => {
    setSelectedId(c.id)
    setError('')
    if (c.view_type_hint && !u.filledViews.includes(c.view_type_hint)) setView(c.view_type_hint)
  }

  const confirm = async () => {
    if (!selected || !view) return
    setBusy(true)
    setError('')
    try {
      const file = await fetchDeviceCaptureFile(selected)
      u.selectDeviceCapture(selected, file, view)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title="Upload dari device"
      subtitle={
        <>
          Pilih foto dari Inbox untuk subjek <span className="font-semibold text-slate-700">{subjectLabel || 'aktif'}</span>.
          Foto baru tersimpan ke subjek setelah Anda menekan “Proses dengan AI Model”.
        </>
      }
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-ghost h-10 px-4 text-[13.5px]">
            Batal
          </button>
          <button onClick={confirm} disabled={!selected || !view || busy} className="btn-primary h-10 px-4 text-[13.5px] disabled:cursor-not-allowed">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Gunakan foto ini
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12.5px] font-medium text-slate-700">Sudut citra</div>
          <div className="mt-1.5">
            <ViewPicker value={view} onChange={setView} filled={u.filledViews} disabled={busy} />
          </div>
        </div>
        <button onClick={load} disabled={loading || busy} className="btn-ghost h-9 px-3 text-[12.5px]">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      <div className="mt-4">
        {loadError ? (
          <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            {loadError}
          </p>
        ) : captures.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-10 text-center">
            {loading ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : <Inbox className="h-7 w-7 text-slate-300" />}
            <p className="text-[13px] text-slate-500">
              {loading ? 'Memuat Inbox…' : 'Inbox kosong. Ambil foto dengan alat, lalu tekan “Muat ulang”.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {captures.map((c) => (
              <DeviceCaptureCard key={c.id} capture={c} compact selected={c.id === selectedId} onSelect={() => pick(c)} />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          {error}
        </p>
      )}
    </Modal>
  )
}
