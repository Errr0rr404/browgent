import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FolderOpen, Images, Trash2, X } from 'lucide-react'
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
  const [assetBusy, setAssetBusy] = useState(false)
  const [assetNote, setAssetNote] = useState<string | null>(null)
  const [pageAssets, setPageAssets] = useState<
    Array<{ url: string; kind: string; name: string }>
  >([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(() => new Set())
  const [assetsOpen, setAssetsOpen] = useState(false)
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

  const loadPageAssets = useCallback(async () => {
    if (!window.browgent?.listPageAssets) {
      setAssetNote('Asset list unavailable')
      return
    }
    setAssetBusy(true)
    setAssetNote(null)
    try {
      const assets = await window.browgent.listPageAssets()
      const list = assets.slice(0, 80)
      setPageAssets(list)
      // Default-select images + documents
      const defaults = list
        .filter((a) => a.kind === 'image' || a.kind === 'document')
        .map((a) => a.url)
      const pick = defaults.length ? defaults : list.map((a) => a.url)
      setSelectedUrls(new Set(pick.slice(0, 40)))
      setAssetsOpen(true)
      if (!list.length) setAssetNote('No assets found on this page')
    } catch (e) {
      setAssetNote(e instanceof Error ? e.message : 'Asset list failed')
    } finally {
      setAssetBusy(false)
    }
  }, [])

  const downloadSelectedAssets = useCallback(async () => {
    if (!window.browgent?.downloadPageAssets) {
      setAssetNote('Asset download unavailable')
      return
    }
    const urls = [...selectedUrls].slice(0, 40)
    if (!urls.length) {
      setAssetNote('Select at least one asset')
      return
    }
    setAssetBusy(true)
    setAssetNote(null)
    try {
      const host = (() => {
        try {
          return new URL(urls[0] || 'https://page.local').hostname.replace(/\W+/g, '-').slice(0, 40)
        } catch {
          return 'page'
        }
      })()
      const result = await window.browgent.downloadPageAssets({
        urls,
        subfolder: `browgent-${host || 'assets'}`
      })
      setAssetNote(
        result.started
          ? `Started ${result.started} download(s)`
          : result.errors[0] || 'Nothing started'
      )
      if (result.started) {
        setAssetsOpen(false)
        setPageAssets([])
      }
    } catch (e) {
      setAssetNote(e instanceof Error ? e.message : 'Asset save failed')
    } finally {
      setAssetBusy(false)
    }
  }, [selectedUrls])

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
              title="Save page assets (images/docs)"
              aria-label="Save page assets"
              disabled={assetBusy}
              onClick={() => void loadPageAssets()}
            >
              <Images size={14} strokeWidth={1.75} />
            </button>
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
          {assetNote && <p className="downloads-empty">{assetNote}</p>}
          {assetsOpen && pageAssets.length > 0 && (
            <div className="downloads-assets-picker" style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6
                }}
              >
                <span className="downloads-empty" style={{ margin: 0 }}>
                  Page assets ({selectedUrls.size}/{pageAssets.length})
                </span>
                <span className="downloads-row-btns">
                  <button
                    type="button"
                    className="downloads-link-btn"
                    onClick={() => setSelectedUrls(new Set(pageAssets.map((a) => a.url)))}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="downloads-link-btn"
                    onClick={() =>
                      setSelectedUrls(
                        new Set(
                          pageAssets
                            .filter((a) => a.kind === 'image' || a.kind === 'document')
                            .map((a) => a.url)
                        )
                      )
                    }
                  >
                    Images
                  </button>
                  <button
                    type="button"
                    className="downloads-link-btn"
                    onClick={() => setSelectedUrls(new Set())}
                  >
                    None
                  </button>
                </span>
              </div>
              <ul className="downloads-list" style={{ maxHeight: 160, overflow: 'auto' }}>
                {pageAssets.map((a) => {
                  const checked = selectedUrls.has(a.url)
                  return (
                    <li key={a.url} className="downloads-row">
                      <label
                        className="downloads-row-top"
                        style={{ cursor: 'pointer', gap: 8, alignItems: 'flex-start' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedUrls((prev) => {
                              const next = new Set(prev)
                              if (next.has(a.url)) next.delete(a.url)
                              else next.add(a.url)
                              return next
                            })
                          }}
                        />
                        <span className="downloads-name" title={a.url}>
                          [{a.kind}] {a.name || a.url}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                className="downloads-link-btn"
                style={{ marginTop: 6 }}
                disabled={assetBusy || selectedUrls.size === 0}
                onClick={() => void downloadSelectedAssets()}
              >
                Download selected ({selectedUrls.size})
              </button>
            </div>
          )}
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
