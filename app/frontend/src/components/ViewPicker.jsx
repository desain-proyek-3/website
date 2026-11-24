import { CheckCircle2 } from 'lucide-react'
import { VIEW_TYPES } from '../lib/api.js'

/**
 * Depan / Kiri / Kanan segmented picker; angles in `filled` are disabled.
 * @param {{ value: string|null, onChange: (v: string) => void, filled?: string[], disabled?: boolean }} props
 */
export default function ViewPicker({ value, onChange, filled = [], disabled = false }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
      {VIEW_TYPES.map((v) => {
        const isFilled = filled.includes(v.value)
        const active = value === v.value
        return (
          <button
            key={v.value}
            type="button"
            disabled={isFilled || disabled}
            onClick={() => onChange(v.value)}
            title={isFilled ? 'Sudut ini sudah memiliki citra' : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors
              ${active && !isFilled ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'}
              ${isFilled ? 'cursor-not-allowed text-slate-400' : 'hover:text-ink'}`}
          >
            {isFilled && <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />}
            {v.label}
          </button>
        )
      })}
    </div>
  )
}

/** First angle not yet filled, preferring `preferred` when it is free. */
export function firstFreeView(filled = [], preferred = null) {
  if (preferred && !filled.includes(preferred)) return preferred
  return VIEW_TYPES.find((v) => !filled.includes(v.value))?.value ?? null
}
