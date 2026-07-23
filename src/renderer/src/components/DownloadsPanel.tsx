import { useEffect, useState } from 'react'
import { Download, FolderOpen, Trash2, X } from 'lucide-react'
import type { DownloadItemState } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
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

export function DownloadsPanel({ open, onClose }: Props): React.JSX.Element | null {
  const [items, setItems] = useState<DownloadItemState[]>([])

  useEffect(() => {
    if (!open || !window.browgent?.getDownloads) return
    void window.browgent.getDownloads().then(setItems).catch(() => setItems([]))
    const unsub = window.browgent.onDownloadsState?.(setItems)
    return () => unsub?.()
  }, [open])

  if (!open) return null

  return (
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
            onClick={onClose}
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
  )
}
