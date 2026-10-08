import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'

/**
 * Modal confirmation for destructive actions, rendered into document.body so
 * the backdrop covers the sticky header and sidebar too.
 * Closes on Esc / backdrop click / Batal unless `busy`; the cancel button is
 * focused on open so Enter never confirms by accident.
 *
 * @param {{ open: boolean, title: string, children?: React.ReactNode, confirmLabel?: string,
 *           busy?: boolean, error?: string, onConfirm: () => void, onCancel: () => void }} props
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Hapus',
  busy = false,
  error = '',
  onConfirm,
  onCancel,
}) {
  const titleId = useId()
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="card w-full max-w-[440px] p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-semibold text-ink">
              {title}
            </h2>
            <div className="mt-1.5 text-[13px] leading-snug text-slate-600">{children}</div>
          </div>
        </div>

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button ref={cancelRef} onClick={onCancel} disabled={busy} className="btn-ghost h-10 px-4 text-[13.5px]">
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-[13.5px] font-semibold text-white
                       shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
