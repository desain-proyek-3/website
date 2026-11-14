import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Cpu, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { INFERENCE_BATCH_MAX, isAiRunning, listUnprocessedImages, triggerInferenceBatch } from '../lib/api.js'

const PAGE = 200
const REFRESH_MS = 5000

const TYPES = [
  { key: 'post_mortem', label: 'Post-mortem (PM)' },
  { key: 'ante_mortem', label: 'Ante-mortem (AM)' },
]

async function fetchAll(subjectType) {
  const items = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await listUnprocessedImages({ subjectType, limit: PAGE, offset })
    items.push(...page.items)
    if (items.length >= page.total || page.items.length === 0) return items
  }
}

/**
 * Dashboard card: images that never completed AI processing (migrated dataset,
 * "Upload tanpa AI", failed runs) + "process all" per subject type. The backend
 * queues them and runs a few at a time (AI_SERVICE_MAX_CONCURRENT_JOBS).
 * Admin: PM + AM; examiner: PM only (AM inference is admin-only); viewer: read-only.
 *
 * @param {{ role?: string, onQueued?: () => void }} props
 */
export default function UnprocessedImagesCard({ role, onQueued }) {
  const [data, setData] = useState(null) // { post_mortem: items[], ante_mortem: items[] }
  const [error, setError] = useState('')
  const [busyType, setBusyType] = useState(null)
  const [message, setMessage] = useState('')
  const timer = useRef(null)

  const allowed = (type) => role === 'admin' || (role === 'examiner' && type === 'post_mortem')

  const load = useCallback(async () => {
    try {
      const [pm, am] = await Promise.all(TYPES.map((t) => fetchAll(t.key)))
      setData({ post_mortem: pm, ante_mortem: am })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
    return () => clearTimeout(timer.current)
  }, [load])

  // While jobs are queued/running, refresh periodically to show progress.
  const running = data ? [...data.post_mortem, ...data.ante_mortem].filter((i) => isAiRunning(i.ai_status)).length : 0
  useEffect(() => {
    clearTimeout(timer.current)
    if (running > 0) timer.current = setTimeout(load, REFRESH_MS)
  }, [data, running, load])

  const processAll = async (type) => {
    const ids = data[type].filter((i) => !isAiRunning(i.ai_status)).map((i) => i.id)
    if (!ids.length) return
    setBusyType(type)
    setMessage('')
    let queued = 0
    let skipped = 0
    try {
      for (let i = 0; i < ids.length; i += INFERENCE_BATCH_MAX) {
        const res = await triggerInferenceBatch(ids.slice(i, i + INFERENCE_BATCH_MAX))
        queued += res.jobs.length
        skipped += res.skipped.length
        setMessage(`${queued} dari ${ids.length} citra masuk antrean AI…`)
      }
      setMessage(
        `${queued} citra masuk antrean AI${skipped ? `, ${skipped} dilewati` : ''}. ` +
          'Diproses bergiliran di server — halaman ini memperbarui progres otomatis.',
      )
      onQueued?.()
    } catch (err) {
      setMessage(`Berhenti setelah ${queued} citra: ${err.message}`)
    } finally {
      setBusyType(null)
      load()
    }
  }

  const total = data ? data.post_mortem.length + data.ante_mortem.length : 0

  return (
    <section className="card p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-teal-700" />
            <h2 className="text-[17px] font-semibold text-ink">Citra belum diproses AI</h2>
          </div>
          <p className="mt-1 max-w-[80ch] text-[13px] text-slate-500">
            Citra tanpa hasil deteksi gigi &amp; embedding (dataset hasil migrasi, "Upload tanpa AI", atau proses
            yang gagal) belum bisa dicocokkan. Proses massal dijalankan bergiliran di server.
          </p>
        </div>
        <button onClick={load} className="btn-ghost h-8 px-3 text-[12px]" aria-label="Muat ulang">
          <RefreshCw className="h-3.5 w-3.5" />
          Muat ulang
        </button>
      </header>

      {error && <p className="mt-4 text-[13px] text-rose-700">{error}</p>}

      {!data ? (
        !error && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          </div>
        )
      ) : total === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] font-medium text-teal-700">
          <CheckCircle2 className="h-4 w-4" />
          Semua citra aktif sudah diproses AI.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {TYPES.map(({ key, label }) => {
            const items = data[key]
            const runningN = items.filter((i) => isAiRunning(i.ai_status)).length
            const failedN = items.filter((i) => i.ai_status === 'failed').length
            const waitingN = items.length - runningN
            return (
              <div key={key} className="rounded-xl border border-slate-200 p-4">
                <div className="readout">{label.toUpperCase()}</div>
                <div className="mt-1 font-mono text-[24px] font-semibold text-ink">{items.length}</div>
                <p className="text-[12px] text-slate-500">
                  {runningN} sedang diproses / dalam antrean · {failedN} gagal sebelumnya
                </p>
                {allowed(key) ? (
                  <button
                    onClick={() => processAll(key)}
                    disabled={busyType !== null || waitingN === 0}
                    className="btn-primary mt-3 h-9 px-3.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyType === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Proses {waitingN} citra
                  </button>
                ) : (
                  items.length > 0 && (
                    <p className="mt-3 text-[11.5px] text-slate-400">
                      {role === 'viewer' ? 'Akun viewer hanya dapat melihat.' : 'Pemrosesan citra AM hanya oleh admin.'}
                    </p>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
      {message && <p className="mt-4 text-[12.5px] text-slate-600">{message}</p>}
    </section>
  )
}
