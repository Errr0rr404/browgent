import { useEffect } from 'react'
import { Check, Info, X } from 'lucide-react'

export type ToastKind = 'success' | 'info' | 'error'

export interface ToastMessage {
  id: string
  kind: ToastKind
  text: string
}

interface Props {
  toast: ToastMessage | null
  onDismiss: () => void
  /** Auto-dismiss ms (0 = manual only) */
  durationMs?: number
}

export function Toast({ toast, onDismiss, durationMs = 3200 }: Props): React.JSX.Element | null {
  useEffect(() => {
    if (!toast || durationMs <= 0) return
    const t = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(t)
  }, [toast, durationMs, onDismiss])

  if (!toast) return null

  const Icon = toast.kind === 'success' ? Check : toast.kind === 'error' ? X : Info

  return (
    <div
      className={`app-toast app-toast-${toast.kind}`}
      role="status"
      aria-live="polite"
    >
      <span className="app-toast-icon" aria-hidden>
        <Icon size={14} strokeWidth={2.25} />
      </span>
      <span className="app-toast-text">{toast.text}</span>
      <button type="button" className="app-toast-close" aria-label="Dismiss" onClick={onDismiss}>
        <X size={12} />
      </button>
    </div>
  )
}
