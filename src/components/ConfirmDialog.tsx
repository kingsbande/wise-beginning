import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Focus the cancel button (the non-destructive option) automatically on mount
    cancelRef.current?.focus()

    // Lock background scrolling when active
    const originalStyle = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel()
      }
      
      // Focus trapping logic for standard keyboard navigators
      if (event.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLButtonElement>('button')
        if (focusables.length >= 2) {
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            last.focus()
            event.preventDefault()
          } else if (!event.shiftKey && document.activeElement === last) {
            first.focus()
            event.preventDefault()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalStyle
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only trigger dismiss if the user actually clicked the outer backdrop, not inside the modal card
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl transition-all border border-slate-100"
      >
        <div className="flex items-start gap-3">
          {danger && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <div className="mt-1 flex-1">
            <h3
              id="confirm-dialog-title"
              className="text-lg font-semibold text-slate-900 leading-snug"
            >
              {title}
            </h3>
            <p
              id="confirm-dialog-message"
              className="mt-2 text-sm text-slate-500 leading-relaxed"
            >
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 text-sm font-semibold text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 focus-visible:ring-red-500'
                : 'bg-slate-900 hover:bg-slate-800 active:bg-black focus-visible:ring-slate-900'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
