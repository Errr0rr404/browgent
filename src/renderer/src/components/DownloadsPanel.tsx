import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FolderOpen, Trash2, X } from 'lucide-react'
import type { DownloadItemState } from '@shared/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * When true (settings / history / new tab), guest WebContentsView is not
   * covering the content hole — render a normal absolute popup under the button.
   * When false, portal an in-flow flyout into `.chrome-top` so Electron cannot
   * paint the native page over the menu.
   */
  overlaySafe?: boolean
  activeCount?: number
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function stateLabel(s: DownloadItemState['state']): string {
  switch (s) {
    case 'progressing':
      return 'Downloading'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'interrupted':
      return 'Interrupted'
    default:
      return s
  }
}

/**
 * Downloads menu: compact popup under the trigger (like ThemePicker).
 * On real guest pages WebContentsView paints above HTML, so we fall back to an
 * in-flow chrome-top flyout that pushes the page bounds down.
 */
export function DownloadsPanel({
  open,
  onOpenChange,
  overlaySafe = true,
  activeCount = 0
}: Props): React.JSX.Element {
  const [items, setItems] = useState<DownloadItemState[]>([])
  const [chromeHost, setChromeHost] = useState<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const useChromeFlyout = open && !overlaySafe

  useEffect(() => {
    setChromeHost(document.querySelector('.chrome-top') as HTMLElement | null)
  }, [])

  useEffect(() => {
    if (!open || !window.browgent?.getDownloads) return
    void window.browgent.getDownloads().then(setItems).catch(() => setItems([]))
    const unsub = window.browgent.onDownloadsState?.(setItems)
    return () => unsub?.()
  }, [open])

  const closeSilently = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const closeAndRestore = useCallback(() => {
    onOpenChange(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      closeSilently()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndRestore()
      }
    }
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, closeSilently, closeAndRestore])

  useLayoutEffect(() => {
    if (!open) return
    // Chrome metrics need a layout pass when the flyout expands top chrome
    window.dispatchEvent(new Event('resize'))
  }, [open, useChromeFlyout])

  const menu = open ? (
    <div
      className={`downloads-flyout${useChromeFlyout ? ' downloads-flyout--chrome' : ' downloads-flyout--popup'}`}
      ref={menuRef}
      id={panelId}
    >
      <div className="downloads-panel" role="dialog" aria-label="Downloads">
        <header className="downloads-panel-header">
          <div className="downloads-panel-title">
            <Download size={14} strokeWidth={1.75} />
            Downloads
          </div>
          <div className="downloads-panel-actions">
            <button
              type="button"
              className="downloads-icon-btn"
              title="Open downloads folder"
              aria-label="Open downloads folder"
              onClick={() => void window.browgent.openDownloadsFolder?.()}
            >
              <FolderOpen size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="downloads-icon-btn"
              title="Clear completed"
              aria-label="Clear completed downloads"
              onClick={() => void window.browgent.clearDownloads?.()}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="downloads-icon-btn"
              title="Close"
              aria-label="Close downloads"
              onClick={closeAndRestore}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="downloads-panel-body">
          {items.length === 0 ? (
            <p className="downloads-empty">No downloads yet.</p>
          ) : (
            <ul className="downloads-list">
              {items.map((it) => {
                const pct =
                  it.totalBytes > 0
                    ? Math.min(100, Math.round((it.receivedBytes / it.totalBytes) * 100))
                    : it.state === 'completed'
                      ? 100
                      : 0
                return (
                  <li key={it.id} className="downloads-row">
                    <div className="downloads-row-top">
                      <button
                        type="button"
                        className="downloads-name"
                        disabled={it.state !== 'completed'}
                        title={it.savePath || it.filename}
                        onClick={() => void window.browgent.openDownload?.(it.id)}
                      >
                        {it.filename}
                      </button>
                      <span className={`downloads-state state-${it.state}`}>
                        {stateLabel(it.state)}
                      </span>
                    </div>
                    {it.state === 'progressing' && (
                      <div className="downloads-progress" aria-hidden>
                        <div className="downloads-progress-bar" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="downloads-row-meta">
                      <span>
                        {formatBytes(it.receivedBytes)}
                        {it.totalBytes > 0 ? ` / ${formatBytes(it.totalBytes)}` : ''}
                        {it.state === 'progressing' && it.totalBytes > 0 ? ` · ${pct}%` : ''}
                      </span>
                      <span className="downloads-row-btns">
                        {it.state === 'progressing' && (
                          <button
                            type="button"
                            className="downloads-link-btn"
                            onClick={() => void window.browgent.cancelDownload?.(it.id)}
                          >
                            Cancel
                          </button>
                        )}
                        {(it.state === 'completed' || it.state === 'interrupted') && (
                          <button
                            type="button"
                            className="downloads-link-btn"
                            onClick={() => void window.browgent.showDownload?.(it.id)}
                          >
                            Show
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="downloads-picker" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`icon-btn downloads-btn${open ? ' active' : ''}`}
        aria-label="Downloads"
        title="Downloads (⌘⇧J)"
        aria-pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => onOpenChange(!open)}
      >
        <Download size={16} strokeWidth={1.75} />
        {activeCount > 0 && (
          <span className="downloads-badge" aria-hidden>
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        )}
      </button>

      {menu && (useChromeFlyout && chromeHost ? createPortal(menu, chromeHost) : menu)}
    </div>
  )
}
