import { CheckCircle2, Clock, Cpu, ImageOff } from 'lucide-react'
import { useState } from 'react'
import { VIEW_TYPES, formatBytes } from '../lib/api.js'

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '–'

const viewLabel = (v) => VIEW_TYPES.find((t) => t.value === v)?.label || v

/**
 * Thumbnail + metadata of one Inbox photo. Selectable (button) when `onSelect`
 * is given; `actions` renders below the metadata (Inbox page buttons).
 *
 * @param {{ capture: object, selected?: boolean, onSelect?: () => void, actions?: React.ReactNode, compact?: boolean }} props
 */
export default function DeviceCaptureCard({ capture: c, selected = false, onSelect, actions, compact = false }) {
  const [broken, setBroken] = useState(false)

  const image = (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
      {c.image_url && !broken ? (
        <img
          src={c.image_url}
          alt={`Foto dari ${c.device_code}`}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-slate-400">
          <ImageOff className="h-6 w-6" />
        </div>
      )}
      {selected && (
        <span className="absolute right-2 top-2 rounded-full bg-white shadow">
          <CheckCircle2 className="h-6 w-6 text-teal-600" />
        </span>
      )}
      {c.view_type_hint && (
        <span className="absolute left-2 top-2 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10.5px] font-medium text-white">
          Saran: {viewLabel(c.view_type_hint)}
        </span>
      )}
    </div>
  )

  const meta = (
    <div className="mt-2 space-y-0.5 text-left text-[11.5px] leading-snug text-slate-500">
      <div className="flex items-center gap-1.5 font-medium text-slate-700">
        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        {fmtDateTime(c.captured_at || c.received_at)}
      </div>
      <div className="flex items-center gap-1.5">
        <Cpu className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate">{c.device_name || c.device_code}</span>
        <span className="ml-auto shrink-0 font-mono">{formatBytes(c.file_size)}</span>
      </div>
      {!compact && (
        <div className="truncate font-mono text-[10.5px] text-slate-400" title={`SHA-256 ${c.file_hash}`}>
          sha256 {c.file_hash.slice(0, 16)}…
        </div>
      )}
    </div>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`rounded-xl border p-2 text-left transition-colors ${
          selected ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/30' : 'border-slate-200 bg-white hover:border-teal-300'
        }`}
      >
        {image}
        {meta}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <a href={c.image_url || undefined} target="_blank" rel="noreferrer" title="Buka ukuran asli">
        {image}
      </a>
      {meta}
      {actions && <div className="mt-2.5 flex gap-2">{actions}</div>}
    </div>
  )
}
