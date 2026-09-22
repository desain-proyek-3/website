import { useCallback, useId, useRef, useState } from 'react'
import { AlertCircle, FileImage, UploadCloud, X } from 'lucide-react'
import { ACCEPTED_TYPES, MAX_FILE_MB } from '../lib/api.js'

function validate(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Only PNG or JPEG images are accepted.'
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `File is larger than ${MAX_FILE_MB} MB.`
  }
  return null
}

/**
 * @param {{ file: File|null, previewUrl: string|null, onSelect:(file:File)=>void, onClear:()=>void, disabled?: boolean }} props
 */
export default function Dropzone({ file, previewUrl, onSelect, onClear, disabled = false }) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')

  const handleFiles = useCallback(
    (fileList) => {
      const picked = fileList?.[0]
      if (!picked) return
      const problem = validate(picked)
      if (problem) {
        setError(problem)
        return
      }
      setError('')
      onSelect(picked)
    },
    [onSelect]
  )

  if (file) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="relative bg-viewer-900">
          <img
            src={previewUrl}
            alt={`Preview of ${file.name}`}
            className="max-h-[420px] w-full object-contain"
          />
          {!disabled && (
            <button
              onClick={onClear}
              className="absolute right-3 top-3 rounded-lg bg-viewer-900/80 p-2 text-slate-300 hover:text-white"
              aria-label="Remove this image"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <FileImage className="h-4 w-4 shrink-0 text-teal-600" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">{file.name}</span>
          <span className="shrink-0 font-mono text-[12px] text-slate-400">
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed
                    px-6 py-16 text-center transition-colors
                    ${dragOver ? 'border-teal-500 bg-teal-50/60' : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70'}`}
      >
        <span className="grid h-14 w-14 place-items-center rounded-full bg-teal-100 text-teal-700">
          <UploadCloud className="h-6 w-6" />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-ink">
            Drag a dental image here, or <span className="text-teal-700">browse files</span>
          </p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            PNG or JPEG · panoramic or intraoral · up to {MAX_FILE_MB} MB
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  )
}
