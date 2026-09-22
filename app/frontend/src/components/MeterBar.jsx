export default function MeterBar({ label, value, hint, tone = 'teal' }) {
  const fill = {
    teal: 'bg-teal-600',
    amber: 'bg-signal-amber',
    cyan: 'bg-signal-cyan',
  }[tone]

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-slate-600">{label}</span>
        <span className="font-mono text-[13px] font-semibold text-ink">{value}%</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${value}%` }} />
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-slate-400">{hint}</p>}
    </div>
  )
}
