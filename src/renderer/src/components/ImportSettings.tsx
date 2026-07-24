import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import type { DetectedBrowser, ImportResult } from '@shared/import-types'
import { useBookmarks } from '../stores/bookmarks'
import '../styles/chrome-pages.css'

type ImportResultUi = ImportResult & {
  bookmarks?: { title: string; url: string }[]
  bookmarksAdded?: number
  bookmarksSkipped?: number
}

export function ImportSettings(): React.JSX.Element {
  const [browsers, setBrowsers] = useState<DetectedBrowser[]>([])
  const [loading, setLoading] = useState(true)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [withPasswords, setWithPasswords] = useState(false)
  const [lastResult, setLastResult] = useState<ImportResultUi | null>(null)
  const [error, setError] = useState<string | null>(null)
  const addBookmark = useBookmarks((s) => s.addBookmark)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.browgent.detectBrowsers()
      setBrowsers(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detect failed')
      setBrowsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runImport = async (b: DetectedBrowser): Promise<void> => {
    if (importingId) return
    setImportingId(b.id)
    setError(null)
    setLastResult(null)
    try {
      const result = await window.browgent.importFromBrowser({
        browserId: b.id,
        history: b.supports.history,
        bookmarks: b.supports.bookmarks,
        passwords: withPasswords && b.supports.passwords
      })
      let bookmarksAdded = 0
      let bookmarksSkipped = 0
      // Merge bookmarks into local store (skip URLs already bookmarked)
      if (result.bookmarks?.length) {
        const isBookmarked = useBookmarks.getState().isBookmarkedUrl
        const list = result.bookmarks
        for (let i = 0; i < list.length; i++) {
          if (bookmarksAdded >= 500) {
            bookmarksSkipped += list.length - i
            break
          }
          const item = list[i]
          try {
            if (isBookmarked(item.url)) {
              bookmarksSkipped++
              continue
            }
            addBookmark({ title: item.title, url: item.url })
            bookmarksAdded++
          } catch {
            bookmarksSkipped++
          }
        }
      }
      setLastResult({ ...result, bookmarksAdded, bookmarksSkipped })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImportingId(null)
    }
  }

  const busy = importingId != null
  const anyPasswordSupport = browsers.some((b) => b.supports.passwords)

  return (
    <section className="settings-section settings-section-stack">
      <div>
        <h2>Import from browsers</h2>
        <p className="settings-lead">
          Detects browsers on this machine. One click imports history, bookmarks, and (optionally)
          passwords — all local, never uploaded. <strong>Fully quit</strong> the source browser
          before importing so Chromium can flush its history database.
        </p>
      </div>

      <div className="settings-card settings-card-pad">
        <label className="settings-check-row">
          <input
            type="checkbox"
            checked={withPasswords}
            onChange={(e) => setWithPasswords(e.target.checked)}
            disabled={!anyPasswordSupport || busy}
          />
          <span>
            Include passwords where supported
            {typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
              ? ' (macOS may prompt for Keychain access)'
              : ' (Windows decryption not available yet — history/bookmarks still work)'}
          </span>
        </label>
        <button
          type="button"
          className="settings-btn"
          style={{ marginTop: 10 }}
          onClick={() => void refresh()}
          disabled={loading || busy}
        >
          <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Re-scan
        </button>
      </div>

      {loading && (
        <p className="settings-lead import-status-line">
          <Loader2 size={14} className="spin" aria-hidden /> Scanning for browsers…
        </p>
      )}

      {error && (
        <p className="settings-lead import-error" role="alert">
          {error}
        </p>
      )}

      {!loading && browsers.length === 0 && (
        <p className="settings-lead">
          No supported browsers detected. Install Chrome, Edge, Brave, Arc, Firefox, or Safari, then
          re-scan.
        </p>
      )}

      <div className="import-browser-list" aria-busy={busy}>
        {browsers.map((b) => {
          const canImport = Boolean(b.profilePath) && !busy
          const isThis = importingId === b.id
          return (
            <div key={b.id} className="import-browser-card">
              <div className="import-browser-meta">
                <strong>{b.name}</strong>
                <span className="settings-muted">
                  {[
                    b.supports.history && 'history',
                    b.supports.bookmarks && 'bookmarks',
                    b.supports.passwords && 'passwords'
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'limited'}
                </span>
                {b.notes && <span className="settings-toggle-sub">{b.notes}</span>}
                {!b.profilePath && (
                  <span className="settings-toggle-sub">Profile path not found</span>
                )}
              </div>
              <button
                type="button"
                className="settings-btn settings-btn-accent import-run-btn"
                disabled={!canImport}
                onClick={() => void runImport(b)}
              >
                {isThis ? (
                  <>
                    <Loader2 size={14} className="spin" aria-hidden /> Importing…
                  </>
                ) : (
                  <>
                    <Download size={14} aria-hidden /> Import
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {lastResult && (
        <div
          className={`settings-card settings-card-pad import-result-card${
            lastResult.errors.length ? ' import-result-card--warn' : ' import-result-card--ok'
          }`}
          role="status"
        >
          <p className="settings-toggle-label">
            Imported from {lastResult.browserName}
            <span className="settings-muted"> · {lastResult.durationMs}ms</span>
          </p>
          <ul className="import-result-list">
            <li>History: {lastResult.historyImported.toLocaleString()}</li>
            <li>
              Bookmarks:{' '}
              {lastResult.bookmarksAdded != null
                ? `${lastResult.bookmarksAdded.toLocaleString()} added`
                : lastResult.bookmarksImported.toLocaleString()}
              {lastResult.bookmarksSkipped
                ? ` (${lastResult.bookmarksSkipped.toLocaleString()} already saved)`
                : ''}
            </li>
            <li>
              Passwords: {lastResult.passwordsImported.toLocaleString()}
              {lastResult.passwordsSkipped
                ? ` (${lastResult.passwordsSkipped.toLocaleString()} skipped)`
                : ''}
            </li>
          </ul>
          {lastResult.historyImported > 0 && (
            <p className="settings-toggle-sub">Open History (⌘Y) to browse imported visits.</p>
          )}
          {lastResult.passwordsImported > 0 && (
            <p className="settings-toggle-sub">
              Passwords are in Settings → User Hub → vault (origins only).
            </p>
          )}
          {lastResult.warnings.map((w) => (
            <p key={w} className="settings-toggle-sub import-warn">
              {w}
            </p>
          ))}
          {lastResult.errors.map((err) => (
            <p key={err} className="settings-toggle-sub import-error-line">
              {err}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
