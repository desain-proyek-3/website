import { bboxToPixels } from '../lib/api.js'

/** Confidence dalam persen (AI mengirim 0–1; data lama bisa sudah 0–100). */
export const toothConfidence = (t) =>
  t.confidence_score == null ? null : t.confidence_score <= 1 ? t.confidence_score * 100 : t.confidence_score

const LOW_CONFIDENCE = 85

/**
 * Overlay SVG bbox + label FDI di atas citra (dipakai viewer Feature analysis & pop-up analisis ulang).
 * Diletakkan di dalam container `relative` yang membungkus <img>.
 *
 * @param {{ teeth: object[], natural: { w: number, h: number } | null, overlay?: boolean, labels?: boolean }} props
 */
export default function ToothOverlay({ teeth, natural, overlay = true, labels = true }) {
  if (!natural || (!overlay && !labels)) return null
  const boxes = teeth
    .map((t, i) => ({ t, key: t.id || `${t.fdi_number}-${i}`, box: bboxToPixels(t.bbox, natural.w, natural.h) }))
    .filter((b) => b.box)
  if (!boxes.length) return null
  const strokeW = Math.max(natural.w, natural.h) / 400

  return (
    <svg
      viewBox={`0 0 ${natural.w} ${natural.h}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {boxes.map(({ t, key, box }) => {
        const conf = toothConfidence(t)
        const color = conf != null && conf < LOW_CONFIDENCE ? '#f5b544' : '#2dd4bf'
        return (
          <g key={key}>
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
  )
}
