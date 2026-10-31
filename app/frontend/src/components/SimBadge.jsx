import { FlaskConical } from 'lucide-react'

/** Marks UI that still shows static demo data (no backend source yet). */
export default function SimBadge({ dark = false }) {
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
