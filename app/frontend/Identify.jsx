import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Loader2,
  RotateCcw,
  ServerCog,
  Sparkles,
} from 'lucide-react'
import Dropzone from '../components/Dropzone.jsx'
import { identifyImage, usingMock } from '../lib/api.js'
import { CASE } from '../lib/data.js'

const STAGES = ['Uploading image', 'Extracting dental features', 'Matching against AM records']

const STATUS_STYLE = {
  match: { chip: 'bg-teal-50 text-teal-700 ring-teal-200', Icon: CheckCircle2, word: 'MATCH' },
  review: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: CircleDot, word: 'REVIEW' },
  conflict: { chip: 'bg-rose-50 text-rose-700 ring-rose-200', Icon: AlertTriangle, word: 'CONFLICT' },
}

export default function Identify() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [status, setStatus] = useState('idle') // idle | processing | done | error
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const abortRef = useRef(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const reset = () => {
    abortRef.current?.abort()
    setFile(null)
    setResult(null)
    setErrorMsg('')
    setProgress(0)
    setStatus('idle')
  }

  const process = async () => {
    if (!file) return
    setStatus('processing')
    setErrorMsg('')
    setProgress(0)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const data = await identifyImage(file, {
        caseId: CASE.id,
        signal: controller.signal,
        onProgress: setProgress,
      })
      setResult(data)
      setStatus('done')
    } catch (err) {
      if (err.name === 'AbortError') return
      setErrorMsg(err.message || 'Something went wrong while processing this image.')
      setStatus('error')
    }
  }

  const stageIndex = Math.min(Math.floor((progress / 100) * STAGES.length), STAGES.length - 1)
  const topCandidate = result?.candidates?.[0]

  return (
    <div className="space-y-6">
      {usingMock && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ServerCog className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[13px] text-amber-800">
            Running against a mock response — no backend is connected yet. Set{' '}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[12px]">
              VITE_USE_MOCK_API=false
            </code>{' '}
            and <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[12px]">VITE_API_BASE_URL</code> in
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[12px] ml-1">.env</code> once the
            identification API is live.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Upload + preview */}
        <section className="card p-6 xl:col-span-6">
          <h2 className="text-[17px] font-semibold text-ink">Upload a dental image</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            A post-mortem panoramic or intraoral photo. The image is sent to the identification
            service — nothing is analyzed in the browser.
          </p>

          <div className="mt-5">
            <Dropzone
              file={file}
              previewUrl={previewUrl}
              onSelect={(f) => {
                setFile(f)
                setResult(null)
                setStatus('idle')
                setErrorMsg('')
              }}
              onClear={reset}
              disabled={status === 'processing'}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={process}
              disabled={!file || status === 'processing'}
              className="btn-primary h-11 flex-1 px-5 disabled:cursor-not-allowed sm:flex-none"
            >
              {status === 'processing' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Process with AI
                </>
              )}
            </button>
            {(file || status === 'done') && status !== 'processing' && (
              <button onClick={reset} className="btn-ghost h-11 px-5">
                <RotateCcw className="h-4 w-4" />
                Start over
              </button>
            )}
          </div>

          {status === 'processing' && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-600">{STAGES[stageIndex]}</span>
                <span className="font-mono text-[12.5px] text-slate-500">{progress}%</span>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-teal-600 transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-rose-50 p-4">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="text-[13.5px] font-semibold text-rose-800">Processing failed</p>
                <p className="mt-0.5 text-[12.5px] text-rose-700">{errorMsg}</p>
              </div>
            </div>
          )}
        </section>

        {/* Results */}
        <section className="card p-6 xl:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-ink">Identification result</h2>
            {result && (
              <span className="font-mono text-[11.5px] text-slate-400">{result.processingTimeMs} ms</span>
            )}
          </div>

          {!result ? (
            <div className="mt-6 flex h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 text-center">
              <ServerCog className="h-8 w-8 text-slate-300" />
              <p className="max-w-[32ch] text-[13px] text-slate-400">
                Upload an image and run it through the AI to see candidate matches here.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {result.imageQuality.issues.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <div className="text-[12.5px] text-amber-800">
                    <span className="font-semibold">Image quality {result.imageQuality.score}/100.</span>{' '}
                    {result.imageQuality.issues.join('; ')}.
                  </div>
                </div>
              )}

              <div>
                <h3 className="readout">EXTRACTED FEATURES</h3>
                <dl className="mt-2.5 grid grid-cols-2 gap-3">
                  {result.extractedFeatures.map((f) => (
                    <div key={f.label} className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                      <dt className="text-[11.5px] text-slate-500">{f.label}</dt>
                      <dd className="mt-0.5 font-mono text-[14px] font-semibold text-ink">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h3 className="readout">CANDIDATE MATCHES</h3>
                <ul className="mt-2.5 space-y-2.5">
                  {result.candidates.map((c) => {
                    const s = STATUS_STYLE[c.status]
                    return (
                      <li key={c.amId} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-ink">{c.name}</span>
                              <span className="font-mono text-[12px] text-teal-700">{c.amId}</span>
                            </div>
                            <p className="mt-1 max-w-[46ch] text-[12.5px] leading-snug text-slate-500">
                              {c.notes}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-mono text-[20px] font-semibold leading-none text-ink">
                              {c.confidence}%
                            </div>
                            <span className={`chip mt-1.5 ring-1 ${s.chip}`}>
                              <s.Icon className="h-3 w-3" />
                              {s.word}
                            </span>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {topCandidate && (
                <Link
                  to="/review"
                  className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-teal-700 hover:text-teal-800"
                >
                  Send top match to forensic review
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
