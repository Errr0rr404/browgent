import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { FindInPageResult, TabId } from '@shared/types'

interface Props {
  open: boolean
  tabId: TabId | undefined
  onClose: () => void
}

export function FindBar({ open, tabId, onClose }: Props): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<FindInPageResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastQuery = useRef('')
  const prevTabId = useRef(tabId)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResult(null)
      lastQuery.current = ''
      if (tabId) void window.browgent.stopFindInPage?.(tabId)
      return
    }
    const t = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 30)
    return () => window.clearTimeout(t)
  }, [open, tabId])

  useEffect(() => {
    if (!open || !window.browgent?.onFindResult) return
    return window.browgent.onFindResult((r) => {
      // Require matching tabId so results from another tab never paint here
      if (!tabId || r.tabId !== tabId) return
      setResult(r)
    })
  }, [open, tabId])

  // On tab switch while open: stop old find, clear stale match counts, re-run if needed
  useEffect(() => {
    const prev = prevTabId.current
    prevTabId.current = tabId
    if (prev && prev !== tabId) {
      void window.browgent.stopFindInPage?.(prev)
    }
    if (!open || !tabId) return
    setResult(null)
    lastQuery.current = ''
    const q = query.trim()
    if (q) {
      void window.browgent.findInPage?.(q, { findNext: false, forward: true }, tabId)
      lastQuery.current = q
    }
    return () => {
      if (tabId) void window.browgent.stopFindInPage?.(tabId)
    }
    // Only re-bind on tab/open change — not every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, open])

  if (!open) return null

  const runFind = (text: string, findNext: boolean, forward = true): void => {
    if (!window.browgent?.findInPage || !tabId) return
    const q = text.trim()
    if (!q) {
      void window.browgent.stopFindInPage(tabId)
      setResult(null)
      lastQuery.current = ''
      return
    }
    const isNext = findNext && lastQuery.current === q
    lastQuery.current = q
    void window.browgent.findInPage(q, { findNext: isNext, forward }, tabId)
  }

  const matchLabel =
    result && result.matches > 0
      ? `${result.activeMatchOrdinal} of ${result.matches}`
      : query.trim()
        ? 'No matches'
        : ''

  return (
    <div className="find-bar" role="search" aria-label="Find in page">
      <input
        ref={inputRef}
        className="find-bar-input"
        type="search"
        placeholder="Find in page"
        value={query}
        aria-label="Find"
        onChange={(e) => {
          const v = e.target.value
          setQuery(v)
          runFind(v, false, true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            runFind(query, true, !e.shiftKey)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <span className="find-bar-count" aria-live="polite">
        {matchLabel}
      </span>
      <button
        type="button"
        className="find-bar-btn"
        title="Previous"
        aria-label="Previous match"
        onClick={() => runFind(query, true, false)}
      >
        <ChevronUp size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="find-bar-btn"
        title="Next"
        aria-label="Next match"
        onClick={() => runFind(query, true, true)}
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="find-bar-btn find-bar-close"
        title="Close"
        aria-label="Close find bar"
        onClick={onClose}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
