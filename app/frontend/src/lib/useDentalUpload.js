import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  PollTimeoutError,
  VIEW_TYPES,
  listSubjectImages,
  normalizeDetectedTeeth,
  pollInferenceJob,
  triggerInference,
  uploadDentalImage,
} from './api.js'

const BUSY = new Set(['uploading', 'pending', 'processing'])

export const DEFAULT_NO_ACCESS_MSG = 'Akun Anda tidak memiliki akses untuk mengunggah citra atau menjalankan AI.'

/**
 * Upload one image for a subject, trigger inference and poll it to completion.
 * Shared by Identify (post-mortem) and AmRecords (ante-mortem).
 *
 * phase: idle | uploading | pending | processing | done | failed | error
 *        | uploaded (stored without AI — uploadOnly(), temporary until the AI service is live)
 *
 * @param {string|null} subjectId  active subject; changing it resets the flow
 * @param {{ onCompleted?: (r: { job: object, imageId: string, view: string, file: File, teeth: object[] }) => void,
 *           noAccessMessage?: string }} opts
 */
export function useDentalUpload(subjectId, { onCompleted, noAccessMessage = DEFAULT_NO_ACCESS_MSG } = {}) {
  const [viewType, setViewType] = useState('depan')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  // Set once the current file is stored on the backend; a failed AI run can
  // then be retried without re-uploading (and the file can't be re-sent).
  const [uploaded, setUploaded] = useState(null) // { imageId, view }
  const [filledViews, setFilledViews] = useState([])
  const abortRef = useRef(null)
  const onCompletedRef = useRef(onCompleted)
  onCompletedRef.current = onCompleted

  const busy = BUSY.has(phase)

  const friendlyError = useCallback(
    (err) => {
      if (err instanceof ApiError && err.status === 403) return noAccessMessage
      return err.message || 'Terjadi kesalahan saat memproses citra ini.'
    },
    [noAccessMessage],
  )

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Elapsed-time counter while the AI is working.
  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    setElapsed(0)
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [busy])

  // Stop polling when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), [])

  const refreshFilledViews = useCallback(async () => {
    if (!subjectId) return null
    try {
      const { items } = await listSubjectImages(subjectId)
      const views = items.map((i) => i.view_type)
      setFilledViews(views)
      return views
    } catch {
      return null
    }
  }, [subjectId])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setFile(null)
    setUploaded(null)
    setErrorMsg('')
    setPhase('idle')
  }, [])

  // New subject: start over and load which angles it already has.
  useEffect(() => {
    reset()
    setFilledViews([])
    refreshFilledViews()
  }, [subjectId, reset, refreshFilledViews])

  // Pick the first angle still free whenever the filled set changes.
  useEffect(() => {
    if (filledViews.includes(viewType)) {
      const free = VIEW_TYPES.find((v) => !filledViews.includes(v.value))
      if (free) setViewType(free.value)
    }
  }, [filledViews, viewType])

  const selectFile = (f) => {
    setFile(f)
    setUploaded(null)
    setPhase('idle')
    setErrorMsg('')
  }

  const newController = () => {
    const controller = new AbortController()
    abortRef.current = controller
    return controller.signal
  }

  const runInference = async (imageId, view, signal, sourceFile) => {
    let job
    try {
      job = await triggerInference(imageId, { signal })
      setPhase(job.status)
      job = await pollInferenceJob(job.id, { signal, onUpdate: (j) => setPhase(j.status) })
    } catch (err) {
      if (err.name === 'AbortError') return
      setErrorMsg(
        err instanceof PollTimeoutError
          ? err.message
          : `Citra tersimpan, tetapi proses AI gagal dimulai: ${friendlyError(err)}`,
      )
      setPhase('error')
      return
    }

    if (job.status === 'failed') {
      setErrorMsg(job.error_message || 'Layanan AI melaporkan kegagalan tanpa pesan error.')
      setPhase('failed')
      return
    }

    setPhase('done')
    onCompletedRef.current?.({
      job,
      imageId,
      view,
      file: sourceFile,
      teeth: normalizeDetectedTeeth(job.result_payload),
    })
  }

  /** Upload the selected file for the chosen angle; returns the image or null on failure. */
  const uploadSelected = async (signal) => {
    const view = viewType
    try {
      const image = await uploadDentalImage({ subjectId, viewType: view, file, signal })
      setFilledViews((prev) => [...new Set([...prev, view])])
      setUploaded({ imageId: image.id, view })
      return { image, view }
    } catch (err) {
      if (err.name === 'AbortError') return null
      if (err instanceof ApiError && err.status === 409) {
        await refreshFilledViews()
        setErrorMsg(
          `Sudut "${view}" untuk subjek ini sudah memiliki citra. Pilih sudut lain, ` +
            'atau hapus citra lama terlebih dahulu jika ingin menggantinya.',
        )
      } else {
        setErrorMsg(friendlyError(err))
      }
      setPhase('error')
      return null
    }
  }

  const process = async () => {
    if (!file || !subjectId || uploaded) return
    setErrorMsg('')
    setPhase('uploading')
    const signal = newController()
    const res = await uploadSelected(signal)
    if (res) await runInference(res.image.id, res.view, signal, file)
  }

  /** TEMPORARY: store the image without running AI (AI service not live yet). */
  const uploadOnly = async () => {
    if (!file || !subjectId || uploaded) return
    setErrorMsg('')
    setPhase('uploading')
    const res = await uploadSelected(newController())
    if (res) setPhase('uploaded')
  }

  // Also used to run AI later on an image stored via uploadOnly().
  const retryInference = () => {
    if (!uploaded) return
    setErrorMsg('')
    setPhase('pending')
    runInference(uploaded.imageId, uploaded.view, newController(), file)
  }

  const allViewsFilled = VIEW_TYPES.every((v) => filledViews.includes(v.value))

  return {
    viewType,
    setViewType,
    file,
    previewUrl,
    phase,
    busy,
    elapsed,
    errorMsg,
    uploaded,
    filledViews,
    allViewsFilled,
    selectFile,
    reset,
    process,
    uploadOnly,
    retryInference,
    refreshFilledViews,
  }
}
