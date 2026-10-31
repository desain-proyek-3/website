/**
 * HTTP client for the Dentify FastAPI backend.
 *
 * ── Configuration ──────────────────────────────────────────────────────────
 * Set in `app/frontend/.env` (see `.env.example`):
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:8000
 *
 * Every request goes through apiFetch(), which attaches the stored JWT as
 * `Authorization: Bearer` and turns a 401 into a global logout.
 *
 * ── Identify flow (see integration.md §3) ──────────────────────────────────
 *   1. POST /api/v1/subjects               JSON { subject_type, full_name?, case_reference?, notes? }
 *   2. POST /api/v1/dental-images/upload   multipart: file, subject_id, view_type (depan|kiri|kanan)
 *   3. POST /api/v1/inference/trigger      JSON { dental_image_id }  → 202, job { id, status: "pending" }
 *   4. GET  /api/v1/inference/jobs/{id}    poll until status is "completed" | "failed"
 *
 * AM candidate matching (Pekan 10):
 *   5. POST /api/v1/matching-results/run   JSON { pm_subject_id, top_k? }  → top 3 AM candidates
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg']
export const MAX_FILE_MB = 20

export const VIEW_TYPES = [
  { value: 'depan', label: 'Depan' },
  { value: 'kiri', label: 'Kiri' },
  { value: 'kanan', label: 'Kanan' },
]

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// ── Session token ────────────────────────────────────────────────────────
// Satu-satunya tempat JWT disimpan. localStorage dipilih agar sesi bertahan
// saat halaman di-refresh (sampai token kadaluarsa — backend: 30 menit, tanpa
// refresh token). auth.js dan semua request di bawah membaca dari sini.
const TOKEN_KEY = 'dentify_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Global 401 handling ──────────────────────────────────────────────────
// AuthContext mendaftarkan handler yang mereset state user; ProtectedRoute
// lalu otomatis mengarahkan ke /login.
let unauthorizedHandler = null

export function onUnauthorized(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

function handleUnauthorized() {
  clearToken()
  if (unauthorizedHandler) unauthorizedHandler()
  else if (window.location.pathname !== '/login') window.location.assign('/login')
}

// FastAPI mengirim error sebagai { detail: string | [{ msg }] }.
function errorMessage(body, status) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  return body?.error || `The service returned an error (${status}).`
}

/**
 * fetch() ke backend dengan header Authorization otomatis dan JSON parsing.
 * @param {string} path  mis. '/api/v1/auth/me'
 * @param {RequestInit & { json?: any, skipAuthRedirect?: boolean }} opts
 *   json             — body yang akan di-JSON-kan (Content-Type diset otomatis);
 *                      untuk multipart, kirim FormData lewat `body` biasa
 *   skipAuthRedirect — 401 tidak memicu logout global (dipakai oleh login)
 */
export async function apiFetch(path, { json, skipAuthRedirect, headers, ...init } = {}) {
  const finalHeaders = { ...authHeaders(), ...headers }
  // FormData bodies are passed through as-is so the browser sets the multipart boundary.
  if (json !== undefined) {
    finalHeaders['Content-Type'] = 'application/json'
    init.body = JSON.stringify(json)
  }

  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers: finalHeaders })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.', 0)
  }

  let body = null
  try {
    body = await res.json()
  } catch {
    // non-JSON body
  }

  if (res.status === 401 && !skipAuthRedirect) handleUnauthorized()
  if (!res.ok) throw new ApiError(errorMessage(body, res.status), res.status)
  return body
}

// ── Users (admin-only) ───────────────────────────────────────────────────

/** @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>} */
export function listUsers({ limit = 100, offset = 0 } = {}) {
  return apiFetch(`/api/v1/users?limit=${limit}&offset=${offset}`)
}

/** @param {{ username: string, email: string, full_name: string, role: string, password: string }} payload */
export function createUser(payload) {
  return apiFetch('/api/v1/users', { method: 'POST', json: payload })
}

/**
 * Full update (PUT). `password` is optional — send it only to reset.
 * @param {string} id
 * @param {{ email: string, full_name: string, role: string, is_active: boolean, password?: string }} payload
 */
export function updateUser(id, payload) {
  return apiFetch(`/api/v1/users/${id}`, { method: 'PUT', json: payload })
}

// ── Subjects ─────────────────────────────────────────────────────────────

/**
 * @param {{ subject_type: 'ante_mortem'|'post_mortem', full_name?: string, case_reference?: string, notes?: string }} payload
 */
export function createSubject(payload) {
  return apiFetch('/api/v1/subjects', { method: 'POST', json: payload })
}

/**
 * @param {{ subjectType?: 'ante_mortem'|'post_mortem', limit?: number }} opts
 * @returns {Promise<{ items: object[], total: number }>} newest first
 */
export function listSubjects({ subjectType, limit = 100 } = {}) {
  const q = new URLSearchParams({ limit: String(limit) })
  if (subjectType) q.set('subject_type', subjectType)
  return apiFetch(`/api/v1/subjects?${q}`)
}

/** Soft-delete a subject together with its active images (admin-only for AM subjects). */
export function deleteSubject(subjectId) {
  return apiFetch(`/api/v1/subjects/${subjectId}`, { method: 'DELETE' })
}

/** @returns {Promise<{ items: object[], total: number }>} active images of one subject */
export function listSubjectImages(subjectId) {
  return apiFetch(`/api/v1/subjects/${subjectId}/images`)
}

// ── Dental images ────────────────────────────────────────────────────────

/** @returns {Promise<object>} image metadata incl. presigned `image_url` */
export function getDentalImage(imageId) {
  return apiFetch(`/api/v1/dental-images/${imageId}`)
}

/**
 * Per-tooth AI detections stored for one image, ordered by FDI number.
 * Empty when the image has not been processed (or inference failed).
 * @returns {Promise<{ items: object[], total: number }>}
 */
export function getToothRecords(imageId) {
  return apiFetch(`/api/v1/dental-images/${imageId}/tooth-records`)
}

/**
 * Turn a stored bbox into pixel coordinates of the original image.
 * The AI contract is not pinned yet: accept `[x, y, w, h]` (PRD) or
 * `{ x, y, width|w, height|h }` (model comment); values that are all ≤ 1 are
 * treated as normalised to the image size.
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function bboxToPixels(bbox, imgW, imgH) {
  if (!bbox) return null
  const [x, y, w, h] = Array.isArray(bbox)
    ? bbox
    : [bbox.x, bbox.y, bbox.width ?? bbox.w, bbox.height ?? bbox.h]
  const nums = [x, y, w, h].map(Number)
  if (nums.some((n) => !Number.isFinite(n))) return null
  const normalised = nums.every((n) => n >= 0 && n <= 1)
  const [sx, sy] = normalised ? [imgW, imgH] : [1, 1]
  return { x: nums[0] * sx, y: nums[1] * sy, w: nums[2] * sx, h: nums[3] * sy }
}

/**
 * Upload one intraoral image. Backend allows one active image per
 * (subject_id, view_type) and answers 409 if that slot is taken.
 */
export function uploadDentalImage({ subjectId, viewType, file, signal }) {
  const form = new FormData()
  form.append('subject_id', subjectId)
  form.append('view_type', viewType)
  form.append('file', file)
  return apiFetch('/api/v1/dental-images/upload', { method: 'POST', body: form, signal })
}

// ── Inference ────────────────────────────────────────────────────────────

export function triggerInference(dentalImageId, { signal } = {}) {
  return apiFetch('/api/v1/inference/trigger', {
    method: 'POST',
    json: { dental_image_id: dentalImageId },
    signal,
  })
}

export function getInferenceJob(jobId, { signal } = {}) {
  return apiFetch(`/api/v1/inference/jobs/${jobId}`, { signal })
}

// Backend polls the AI service every 2 s for up to 60 attempts; the FE
// matches the interval and allows some margin before giving up.
export const POLL_INTERVAL_MS = 2000
export const POLL_TIMEOUT_MS = 3 * 60 * 1000

export class PollTimeoutError extends Error {}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

/**
 * Poll an inference job until it reaches "completed" or "failed".
 * @param {string} jobId
 * @param {{ signal?: AbortSignal, onUpdate?: (job:object)=>void }} opts
 * @returns {Promise<object>} the final job
 */
export async function pollInferenceJob(jobId, { signal, onUpdate } = {}) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  for (;;) {
    const job = await getInferenceJob(jobId, { signal })
    onUpdate?.(job)
    if (job.status === 'completed' || job.status === 'failed') return job
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      throw new PollTimeoutError(
        `Layanan AI belum menyelesaikan job ini setelah ${POLL_TIMEOUT_MS / 60000} menit ` +
          `(status terakhir: ${job.status}). Citra sudah tersimpan; coba cek lagi nanti.`,
      )
    }
    await wait(POLL_INTERVAL_MS, signal)
  }
}

/**
 * Normalise result_payload.detected_teeth. The AI contract is not pinned
 * yet, so accept both key spellings the backend itself accepts.
 * @returns {{ fdi: number, confidence: number|null, bbox: any }[]}
 */
export function normalizeDetectedTeeth(resultPayload) {
  const teeth = resultPayload?.detected_teeth
  if (!Array.isArray(teeth)) return []
  return teeth
    .map((t) => {
      const fdi = Number(t.fdi_id ?? t.fdi_number)
      const raw = t.confidence ?? t.confidence_score
      const conf = raw == null ? null : Number(raw) <= 1 ? Number(raw) * 100 : Number(raw)
      return { fdi, confidence: conf, bbox: t.bbox ?? null }
    })
    .filter((t) => Number.isInteger(t.fdi))
    .sort((a, b) => a.fdi - b.fdi)
}

// ── Matching (AM candidates) ─────────────────────────────────────────────

// Satu sumber ambang confidence untuk Identify, Review & Dashboard:
// ≥79% match (high), 50–78% review (borderline), <50% conflict (exclusion).
export const MATCH_THRESHOLDS = { match: 79, review: 50 }

/** @returns {'match'|'review'|'conflict'} */
export function matchTier(confidence) {
  if (confidence >= MATCH_THRESHOLDS.match) return 'match'
  if (confidence >= MATCH_THRESHOLDS.review) return 'review'
  return 'conflict'
}

// Generic, score-based explanation per tier — the backend returns no
// per-candidate findings, so never imply morphology evidence here.
export const MATCH_TIER_NOTE = {
  match: 'Kemiripan embedding tinggi — prioritaskan verifikasi oleh odontolog.',
  review: 'Kemiripan sedang — perlu perbandingan manual sebelum diputuskan.',
  conflict: 'Kemiripan rendah — kemungkinan bukan individu yang sama.',
}

/**
 * Run 1:N matching of a post-mortem subject against all active ante-mortem
 * subjects (pgvector cosine similarity). Backend keeps the top 3 by default
 * as `pending_review`; 409 = subject has no embedding yet.
 * @returns {Promise<{ pm_subject_id: string, top_k: number, candidates: object[] }>}
 */
export function runMatching(pmSubjectId, { topK, signal } = {}) {
  return apiFetch('/api/v1/matching-results/run', {
    method: 'POST',
    json: { pm_subject_id: pmSubjectId, ...(topK ? { top_k: topK } : {}) },
    signal,
  })
}

/**
 * @param {{ pmSubjectId?: string, amSubjectId?: string, status?: 'pending_review'|'confirmed'|'rejected',
 *           limit?: number, offset?: number }} opts
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>}
 */
export function listMatchingResults({ pmSubjectId, amSubjectId, status, limit = 50, offset = 0 } = {}) {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (pmSubjectId) q.set('pm_subject_id', pmSubjectId)
  if (amSubjectId) q.set('am_subject_id', amSubjectId)
  if (status) q.set('status', status)
  return apiFetch(`/api/v1/matching-results?${q}`)
}

export function getMatchingResult(id) {
  return apiFetch(`/api/v1/matching-results/${id}`)
}

/** Odontologist decision; final (409 if already decided). */
export function confirmMatchingResult(id, decision) {
  return apiFetch(`/api/v1/matching-results/${id}/confirm`, { method: 'POST', json: { decision } })
}

/**
 * Map a backend matching result to the candidate shape the UI (and the
 * analysis history in localStorage) uses. `status` is the confidence tier;
 * the reviewer decision lives in `decision`.
 */
export function toCandidate(r) {
  const confidence = r.confidence_score == null ? 0 : Math.round(r.confidence_score * 10) / 10
  return {
    id: r.id,
    amSubjectId: r.am_subject_id,
    amId: r.am_subject_id.slice(0, 8),
    name: r.am_subject?.full_name || 'Tanpa nama',
    caseReference: r.am_subject?.case_reference || null,
    confidence,
    rank: r.rank,
    status: matchTier(confidence),
    decision: r.status,
  }
}

// ── Stats (Dashboard) ────────────────────────────────────────────────────

/**
 * @returns {Promise<{ subjects: { ante_mortem: number, post_mortem: number }, dental_images: number,
 *   embeddings: { ante_mortem: number, post_mortem: number },
 *   inference_jobs: { pending: number, processing: number, completed: number, failed: number },
 *   matching_results: { pending_review: number, confirmed: number, rejected: number } }>}
 */
export function getStatsSummary() {
  return apiFetch('/api/v1/stats/summary')
}
