import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Globe, Search } from 'lucide-react'
import type { HistoryEntry } from '@shared/types'
import { Favicon } from './Favicon'

export interface OmniboxSuggestItem {
  id: string
  kind: 'history' | 'search' | 'url'
  title: string
  subtitle?: string
  url: string
  favicon?: string
}

interface Props {
  open: boolean
  overlaySafe: boolean
  items: OmniboxSuggestItem[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onPick: (item: OmniboxSuggestItem) => void
}

export function historyToSuggest(entries: HistoryEntry[]): OmniboxSuggestItem[] {
  return entries.map((e) => ({
    id: `h-${e.id}`,
    kind: 'history' as const,
    title: e.title || e.url,
    subtitle: e.url,
    url: e.url,
    favicon: e.favicon
  }))
}

export function OmniboxSuggest({
  open,
  overlaySafe,
  items,
  activeIndex,
  onActiveIndexChange,
  onPick
}: Props): React.JSX.Element | null {
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const chromeHost =
    typeof document !== 'undefined'
      ? (document.querySelector('.chrome-top') as HTMLElement | null)
      : null

  useEffect(() => {
    if (!open) return
    window.dispatchEvent(new Event('resize'))
    return () => {
      window.dispatchEvent(new Event('resize'))
    }
  }, [open, items.length, overlaySafe])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-suggest-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  if (!open || items.length === 0) return null

  const useChromeFlyout = !overlaySafe
  const list = (
    <div
      className={`omnibox-suggest${useChromeFlyout ? ' omnibox-suggest--chrome' : ' omnibox-suggest--popup'}`}
    >
      <div
        ref={listRef}
        className="omnibox-suggest-list"
        role="listbox"
        id={listId}
        aria-label="Address suggestions"
      >
        {items.map((item, i) => {
          const active = i === activeIndex
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              data-suggest-index={i}
              className={`omnibox-suggest-item${active ? ' is-active' : ''}`}
              onMouseEnter={() => onActiveIndexChange(i)}
              onMouseDown={(e) => {
                // Keep the omnibox focused so blur doesn't race the click.
                e.preventDefault()
              }}
              onClick={() => onPick(item)}
            >
              <span className="omnibox-suggest-icon" aria-hidden>
                {item.kind === 'search' ? (
                  <Search size={14} strokeWidth={1.75} />
                ) : item.kind === 'url' ? (
                  <Globe size={14} strokeWidth={1.75} />
                ) : (
                  <Favicon src={item.favicon} title={item.title} size={14} small />
                )}
              </span>
              <span className="omnibox-suggest-text">
                <span className="omnibox-suggest-title">{item.title}</span>
                {item.subtitle && item.subtitle !== item.title && (
                  <span className="omnibox-suggest-sub">{item.subtitle}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  if (useChromeFlyout && chromeHost) {
    return createPortal(list, chromeHost)
  }
  return list
}
