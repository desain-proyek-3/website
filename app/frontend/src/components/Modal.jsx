import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Generic modal shell (portal to body, like ConfirmDialog): closes on Esc /
 * backdrop click / X unless `busy`. Body scrolls; `footer` stays visible.
 *
 * @param {{ open: boolean, title: string, subtitle?: React.ReactNode, children: React.ReactNode,
 *           footer?: React.ReactNode, busy?: boolean, onClose: () => void, maxWidth?: string }} props
 */
export default function Modal({ open, title, subtitle, children, footer, busy = false, onClose, maxWidth = 'max-w-[760px]' }) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-4 py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`card flex max-h-full w-full ${maxWidth} flex-col shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Tutup"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2.5 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
