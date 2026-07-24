import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Search, Trash2, X } from 'lucide-react'
import type { HistoryEntry } from '@shared/types'
import { Favicon } from './Favicon'
import '../styles/chrome-pages.css'

interface Props {
  open: boolean
  onClose: () => void
  onOpenUrl: (url: string, newTab?: boolean) => void
}

function formatWhen(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  })
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const startOf = (x: Date): number =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const day = startOf(d)
  const today = startOf(now)
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  })
}

export function HistoryPage({ open, onClose, onOpenUrl }: Props): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const requestSeq = useRef(0)

  const refresh = useCallback(async (q: string) => {
    if (!window.browgent?.getHistory) return
    const seq = ++requestSeq.current
    setLoading(true)
    try {
      const list = q.trim()
        ? await window.browgent.searchHistory(q.trim(), 500)
        : await window.browgent.getHistory(500)
      // Ignore out-of-order responses from faster later keystrokes
      if (seq !== requestSeq.current) return
      setEntries(list)
    } catch {
      if (seq !== requestSeq.current) return
      setEntries([])
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void refresh(query)
  }, [open, query, refresh])

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>()
    for (const e of entries) {
      const k = dayKey(e.lastVisit)
      const arr = map.get(k) ?? []
      arr.push(e)
      map.set(k, arr)
    }
    return [...map.entries()]
  }, [entries])

  if (!open) return null

  return (
    <div className="settings-page history-page" data-screen-label="History">
      <div className="settings-ambient" aria-hidden />
      <div className="settings-wrap">
        <header className="settings-header">
          <div className="settings-header-text">
            <h1>
              <Clock size={18} strokeWidth={1.75} style={{ marginRight: 8, verticalAlign: -3 }} />
              History
            </h1>
            <div className="settings-url">browgent://history</div>
          </div>
          <button
            type="button"
            className="settings-close"
            aria-label="Close history"
            title="Close (Esc)"
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="history-toolbar">
          <div className="history-search-wrap">
            <Search size={14} strokeWidth={1.75} aria-hidden />
            <input
              className="history-search"
              type="search"
              placeholder="Search history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button
            type="button"
            className="history-clear-btn settings-btn settings-btn-danger"
            disabled={entries.length === 0}
            onClick={() => {
              if (!window.confirm('Clear all browsing history?')) return
              void window.browgent.clearHistory?.().then(() => refresh(query))
            }}
          >
            <Trash2 size={13} strokeWidth={1.75} />
            Clear all
          </button>
        </div>

        <div className="history-body">
          {loading && entries.length === 0 ? (
            <p className="history-empty">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="history-empty">
              {query.trim() ? 'No matching visits.' : 'No browsing history yet.'}
            </p>
          ) : (
            groups.map(([label, rows]) => (
              <section key={label} className="history-group">
                <h2 className="history-group-title">{label}</h2>
                <ul className="history-list">
                  {rows.map((e) => (
                    <li key={e.id} className="history-row">
                      <button
                        type="button"
                        className="history-row-main"
                        onClick={() => onOpenUrl(e.url)}
                        title={e.url}
                      >
                        <Favicon src={e.favicon} title={e.title || e.url} size={16} />
                        <span className="history-row-text">
                          <span className="history-row-title">{e.title || e.url}</span>
                          <span className="history-row-url">{e.url}</span>
                        </span>
                        <span className="history-row-meta">
                          {e.visitCount > 1 ? `${e.visitCount}× · ` : ''}
                          {formatWhen(e.lastVisit)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="history-row-delete"
                        aria-label="Remove from history"
                        title="Remove"
                        onClick={() => {
                          void window.browgent.deleteHistory?.(e.id).then(() => refresh(query))
                        }}
                      >
                        <Trash2 size={13} strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
