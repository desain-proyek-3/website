/**
 * Backend contract for image-based identification.
 *
 * The frontend's only job on this page is: take one dental image, send it to
 * the backend, render whatever comes back. All AI work (feature extraction,
 * AM/PM matching) happens server-side.
 *
 * ── Configuration ──────────────────────────────────────────────────────────
 * Set these in a `.env` file at the project root (see `.env.example`):
 *
 *   VITE_API_BASE_URL=https://your-backend.example.com
 *   VITE_USE_MOCK_API=false
 *
 * With no `.env` file, the page runs against a built-in mock so the UI is
 * demoable before the backend exists. Set VITE_USE_MOCK_API=false once the
 * real endpoint is ready — no other code needs to change.
 *
 * ── Expected endpoint ──────────────────────────────────────────────────────
 * POST {VITE_API_BASE_URL}/api/v1/identify
 * Content-Type: multipart/form-data
 *   field "image": the PNG/JPEG file
 *   field "caseId": string, optional — active DVI case, if the backend scopes by case
 *
 * Expected 200 response (application/json):
 * {
 *   "requestId": "string",
 *   "processingTimeMs": 1830,
 *   "imageQuality": { "score": 0-100, "issues": ["string", ...] },
 *   "extractedFeatures": [
 *     { "label": "Molar rotation", "value": "12.4°" },
 *     ...
 *   ],
 *   "candidates": [
 *     {
 *       "amId": "AM-2291",
 *       "name": "string",
 *       "confidence": 0-100,          // percent
 *       "status": "match" | "review" | "conflict",
 *       "notes": "string"             // short human-readable rationale
 *     },
 *     ...
 *   ]
 * }
 *
 * Non-200 responses should return { "error": "human readable message" }.
 * This client surfaces that message directly in the UI.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API !== 'false'

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg']
export const MAX_FILE_MB = 20

export class ApiError extends Error {}

/**
 * Send one dental image to the backend for AI identification.
 * @param {File} file
 * @param {{ caseId?: string, signal?: AbortSignal, onProgress?: (pct:number)=>void }} opts
 * @returns {Promise<object>} the parsed JSON contract described above
 */
export async function identifyImage(file, opts = {}) {
  if (USE_MOCK) return mockIdentify(file, opts)

  const form = new FormData()
  form.append('image', file)
  if (opts.caseId) form.append('caseId', opts.caseId)

  let res
  try {
    res = await fetch(`${BASE_URL}/api/v1/identify`, {
      method: 'POST',
      body: form,
      signal: opts.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Could not reach the identification service. Check the connection and try again.')
  }

  let body = null
  try {
    body = await res.json()
  } catch {
    // non-JSON body, fall through to status check below
  }

  if (!res.ok) {
    throw new ApiError(body?.error || `The service returned an error (${res.status}).`)
  }
  return body
}

/**
 * Demo-only stand-in for the real backend. Simulates upload progress and
 * returns a plausible result so the page works before the API exists.
 * Delete this function (and the USE_MOCK branch above) once integrated.
 */
function mockIdentify(file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    let pct = 0
    const tick = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(tick)
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      pct = Math.min(pct + Math.random() * 22, 96)
      onProgress?.(Math.round(pct))
    }, 220)

    const timeout = setTimeout(() => {
      clearInterval(tick)
      onProgress?.(100)

      const seed = Array.from(file.name).reduce((a, c) => a + c.charCodeAt(0), file.size)
      const base = 68 + (seed % 30) // 68–97

      resolve({
        requestId: `req_${Date.now().toString(36)}`,
        processingTimeMs: 1400 + (seed % 900),
        imageQuality: {
          score: 74 + (seed % 22),
          issues: base < 80 ? ['Right posterior segment under-exposed'] : [],
        },
        extractedFeatures: [
          { label: 'Landmarks detected', value: '30 / 32' },
          { label: 'Molar rotation', value: `${(10 + (seed % 8)).toFixed(1)}°` },
          { label: 'Inter-arch gap', value: `${(1.6 + (seed % 9) / 10).toFixed(1)} mm` },
          { label: 'Restorations found', value: `${1 + (seed % 3)}` },
        ],
        candidates: [
          {
            amId: 'AM-2291',
            name: 'Alicia Kiyoumi',
            confidence: Math.round(base),
            status: base >= 90 ? 'match' : base >= 78 ? 'review' : 'conflict',
            notes: 'Crown outline and restoration margin on #26/#36 align with the ante-mortem chart.',
          },
          {
            amId: 'AM-2140',
            name: 'Jonathan Kosasih',
            confidence: Math.max(Math.round(base) - 24, 12),
            status: 'conflict',
            notes: 'Anterior morphology diverges; unlikely to be the same individual.',
          },
        ].sort((a, b) => b.confidence - a.confidence),
      })
    }, 1900)

    signal?.addEventListener('abort', () => {
      clearInterval(tick)
      clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

export const usingMock = USE_MOCK
