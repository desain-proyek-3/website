/**
 * Circular match gauge. Two arcs: the completed match share (teal) and the
 * portion still under manual review (amber), so the dial reports the case
 * state rather than just a number.
 */
export default function RadialGauge({
  value = 94,
  pending = 4,
  size = 190,
  label = 'match completed',
}) {
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const done = (Math.min(value, 100) / 100) * c
  const wait = (Math.min(pending, 100 - value) / 100) * c

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${wait} ${c - wait}`}
          strokeDashoffset={-done}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#0D9488"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${done} ${c - done}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <div className="font-mono text-[34px] font-semibold leading-none text-teal-700">{value}%</div>
        <div className="mt-1.5 max-w-[110px] text-[12px] leading-tight text-slate-500">{label}</div>
      </div>
    </div>
  )
}
