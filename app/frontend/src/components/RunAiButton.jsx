import { useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, Sparkles } from 'lucide-react'
import {
  AI_STATUS_LABEL,
  ApiError,
  PollTimeoutError,
  isAiRunning,
  pollInferenceJob,
  runImageInference,
} from '../lib/api.js'

/**
 * Run (or re-run) the AI on one already-stored image and poll it to the end.
 * For old images — migrated dataset or failed runs — that never got
 * tooth records / an embedding. Hidden when the user may not trigger it.
 *
 * @param {{ image: { id: string, ai_status?: string, latest_job_id?: string, ai_error_message?: string },
 *           canRun: boolean, onDone?: (job: object) => void, size?: 'sm'|'md', dark?: boolean }} props
 */
export default function RunAiButton({ image, canRun, onDone, size = 'md', dark = false }) {
  const [state, setState] = useState(isAiRunning(image.ai_status) ? image.ai_status : 'idle')
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    setState(isAiRunning(image.ai_status) ? image.ai_status : 'idle')
    setError('')
    // Job already running (e.g. queued from the Dashboard batch): follow it to the end.
    if (isAiRunning(image.ai_status) && image.latest_job_id) {
      track((opts) => pollInferenceJob(image.latest_job_id, opts))
    }
  }, [image.id, image.ai_status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!canRun && !isAiRunning(state)) return null

  const run = () => {
    setState('pending')
    track((opts) => runImageInference(image.id, opts))
  }

  async function track(start) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError('')
    try {
      const job = await start({ signal: controller.signal, onUpdate: (j) => setState(j.status) })
      setState(job.status === 'completed' ? 'idle' : 'failed')
      if (job.status === 'failed') setError(job.error_message || 'Layanan AI melaporkan kegagalan.')
      onDone?.(job)
    } catch (err) {
      if (err.name === 'AbortError') return
      setState('failed')
      setError(
        err instanceof PollTimeoutError
          ? err.message
          : err instanceof ApiError && err.status === 403
            ? 'Akun Anda tidak dapat menjalankan AI untuk citra ini.'
            : err.message,
      )
    }
  }

  const running = isAiRunning(state)
  const retry = image.ai_status === 'failed' || state === 'failed'
  const label = running ? AI_STATUS_LABEL[state] : retry ? 'Coba lagi proses AI' : 'Jalankan AI'
  const Icon = running ? Loader2 : retry ? RotateCcw : Sparkles
  const sizeCls = size === 'sm' ? 'h-8 px-3 text-[12px]' : 'h-10 px-4 text-[13px]'
  const tone = dark
    ? 'chip bg-teal-500/20 font-semibold text-teal-200 ring-1 ring-teal-400/40 hover:bg-teal-500/30'
    : 'btn-ghost'

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className={`${tone} ${sizeCls} inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <Icon className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
        {label}
      </button>
      {error && <p className={`mt-1.5 max-w-[48ch] text-[11.5px] ${dark ? 'text-rose-300' : 'text-rose-700'}`}>{error}</p>}
    </div>
  )
}
