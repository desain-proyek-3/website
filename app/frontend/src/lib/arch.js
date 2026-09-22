/**
 * Geometry for the synthetic panoramic radiograph.
 *
 * A real panoramic film shows both arches as a shallow "smile" curve: the
 * occlusal plane rises toward the molars. We model that with a parabola and
 * lay teeth out along it, each one rotated to the local tangent so the crowns
 * stay perpendicular to the arch — the same thing a forensic odontologist
 * reads when judging rotation and inter-arch gap.
 */

export const VIEW = { w: 880, h: 440 }

const CENTER_X = VIEW.w / 2
const CURVE_K = 0.00062 // flatness of the occlusal plane
const OCCLUSAL_Y = 232 // y of the bite line at the midline

/** Mesio-distal widths, molar → incisor (mirrored for the other quadrant). */
const WIDTHS = [40, 37, 33, 27, 25, 23, 20, 22]

/** FDI notation, patient's right molar → left molar. */
export const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

/** Universal numbering (1–32), used by the review notes ("tooth #14"). */
export const UNIVERSAL_UPPER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
export const UNIVERSAL_LOWER = [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17]

const fullWidths = [...WIDTHS].reverse().concat(WIDTHS)

const curveY = (x) => OCCLUSAL_Y - CURVE_K * (x - CENTER_X) ** 2
const curveAngle = (x) => (Math.atan(-2 * CURVE_K * (x - CENTER_X)) * 180) / Math.PI

/**
 * @param {'upper'|'lower'} jaw
 * @returns {{id:number,universal:number,index:number,x:number,y:number,angle:number,width:number,height:number,roots:number,jaw:string}[]}
 */
export function buildArch(jaw) {
  const span = VIEW.w - 150
  const total = fullWidths.reduce((a, b) => a + b, 0)
  const scale = span / total
  const gap = 3

  const ids = jaw === 'upper' ? FDI_UPPER : FDI_LOWER
  const universal = jaw === 'upper' ? UNIVERSAL_UPPER : UNIVERSAL_LOWER

  let cursor = 75
  return fullWidths.map((w, i) => {
    const width = w * scale - gap
    const x = cursor + (w * scale) / 2
    cursor += w * scale

    const yBite = curveY(x)
    const crownH = jaw === 'upper' ? 46 : 42
    const offset = jaw === 'upper' ? -(crownH / 2) - 6 : crownH / 2 + 8

    return {
      id: ids[i],
      universal: universal[i],
      index: i,
      x,
      y: yBite + offset,
      biteY: yBite,
      angle: curveAngle(x) * (jaw === 'upper' ? 1 : 1),
      width,
      height: crownH,
      roots: i <= 2 || i >= 13 ? 2 : 1, // molars carry multiple roots
      jaw,
    }
  })
}

/** Path string tracing the occlusal plane, for the red mapping overlay. */
export function occlusalPath(offset = 0) {
  const pts = []
  for (let x = 55; x <= VIEW.w - 55; x += 20) pts.push(`${x},${(curveY(x) + offset).toFixed(1)}`)
  return `M ${pts.join(' L ')}`
}

export { curveY, curveAngle, CENTER_X, OCCLUSAL_Y }
