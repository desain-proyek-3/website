// Formatting shared by the report page, the tooth comparison table and the PDF export
// (components/ReportPdf.jsx), so screen, print and downloaded PDF read the same.
import { VIEW_SHORT, VIEW_TYPES } from './api.js'

export { VIEW_SHORT }

export const fmtDate = (v) =>
  v ? new Date(v).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) : '–'

export const person = (p) => (p ? `${p.full_name || p.username} (${p.username})` : '–')

export const viewLabel = (v) => VIEW_TYPES.find((x) => x.value === v)?.label || v

export const num = (v, digits = 2, suffix = '') => (v == null ? 'Belum tersedia' : `${Number(v).toFixed(digits)}${suffix}`)

// ── Tooth comparison values ──────────────────────────────────────────────
export const fmtValue = (v) => {
  if (v == null) return '–'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '')
  if (typeof v === 'boolean') return v ? 'ya' : 'tidak'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export const fmtDelta = (d) => (d == null ? '' : `Δ ${d > 0 ? '+' : ''}${fmtValue(d)}`)

export const fmtConf = (c) => (c == null ? '–' : `${c.toFixed(1)}%`)

/** "nama: PM → AM Δ…" line of one morphology feature. */
export const featureLine = (f) =>
  `${f.feature}: ${fmtValue(f.pm)} → ${fmtValue(f.am)}` +
  (f.status === 'different' && f.delta != null ? ` ${fmtDelta(f.delta)}` : '') +
  (f.status === 'pm_only' ? ' (hanya PM)' : '') +
  (f.status === 'am_only' ? ' (hanya AM)' : '')

// ── AI analysis references ───────────────────────────────────────────────
export const refLabel = (r) => {
  const section = r.section && r.section.trim() !== '-' ? r.section : null
  return (
    [r.source || 'Sumber tidak diketahui', r.page != null ? `hlm. ${r.page}` : null].filter(Boolean).join(', ') +
    (section ? ` — ${section}` : '')
  )
}

// ── PDF file name ────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')

/**
 * Clean a user-typed file name: strip characters Windows/macOS reject, trim, cap length,
 * always end in ".pdf". Returns null when nothing usable is left.
 */
export function sanitizePdfFilename(name) {
  let base = String(name ?? '')
    .replace(/\.pdf\s*$/i, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 150)
    .trim()
  if (!base) return null
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `_${base}`
  return `${base}.pdf`
}

/** "<referensi-kasus>_DD-MM-YYYY_HH-mm.pdf" in the viewer's local time. */
export function defaultReportFilename(caseReference, at = new Date()) {
  const stamp = `${pad(at.getDate())}-${pad(at.getMonth() + 1)}-${at.getFullYear()}_${pad(at.getHours())}-${pad(at.getMinutes())}`
  return sanitizePdfFilename(`${caseReference?.trim() || 'Laporan'}_${stamp}`) || `Laporan_${stamp}.pdf`
}
