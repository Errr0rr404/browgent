import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Info, Search, X } from 'lucide-react'
import { Favicon } from './Favicon'
import { BrandMark } from './BrandMark'
import {
  buildSearchUrl,
  resolveOmniboxInput,
  useChromePrefs
} from '../stores/chromePrefs'
import { platformModKey } from '../lib/platform'
import '../styles/chrome-pages.css'

const INFO_DISMISS_KEY = 'browgent.newtab.infoDismissed'

export interface NewTabFavorite {
  id: string
  title: string
  url: string
  favicon?: string
}

interface Props {
  onNavigate: (url: string) => void
  onAskAgent: (text: string) => void
  favorites: NewTabFavorite[]
}

const AGENT_CHIPS = [
  'summarize my open tabs',
  'find the newest release of browgent',
  'compare docs: playwright vs puppeteer'
] as const

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC'
] as const

function greetingPrefix(hours: number): string {
  if (hours < 12) return 'Good morning'
  if (hours < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatClock(now: Date): { time: string; date: string } {
  const hrs = String(now.getHours()).padStart(2, '0')
  const mins = String(now.getMinutes()).padStart(2, '0')
  const day = DAYS[now.getDay()]
  const mon = MONTHS[now.getMonth()]
  return {
    time: `${hrs}:${mins}`,
    date: `${day} ${mon} ${now.getDate()}`
  }
}

export function NewTabPage({
  onNavigate,
  onAskAgent,
  favorites
}: Props): React.JSX.Element {
  const { greetingName, ntClock, ntFavs, ntChips, searchEngine } =
    useChromePrefs()
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [infoOpen, setInfoOpen] = useState(() => {
    try {
      // Migrate old welcome dismiss key so returning users aren’t re-prompted
      const legacy = localStorage.getItem('browgent.newtab.welcomeDismissed')
      if (legacy === '1') {
        localStorage.setItem(INFO_DISMISS_KEY, '1')
        localStorage.removeItem('browgent.newtab.welcomeDismissed')
      }
      return localStorage.getItem(INFO_DISMISS_KEY) !== '1'
    } catch {
      return true
    }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const mod = useMemo(() => platformModKey(), [])

  useEffect(() => {
    if (!ntClock) return
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [ntClock])

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [])

  const clock = useMemo(() => formatClock(now), [now])
  const greeting = useMemo(() => {
    const base = greetingPrefix(now.getHours())
    const name = greetingName.trim()
    return name ? `${base}, ${name}.` : `${base}.`
  }, [now, greetingName])

  /** Enter → search engine (or URL if it clearly looks like one). ⌘/Ctrl+Enter → agent. */
  const submitNavigate = useCallback(() => {
    const raw = query.trim()
    if (!raw) return
    // Prefer real search for plain language; only treat as URL when it looks like one
    const looksLikeUrl =
      /^https?:\/\//i.test(raw) ||
      /^\/\//.test(raw) ||
      (/^[^\s]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw) && !/\s/.test(raw))
    const target = looksLikeUrl
      ? resolveOmniboxInput(raw, searchEngine)
      : buildSearchUrl(searchEngine, raw)
    if (!target) return
    onNavigate(target)
    setQuery('')
  }, [query, searchEngine, onNavigate])

  const submitAgent = useCallback(() => {
    const raw = query.trim()
    if (!raw) return
    onAskAgent(raw)
    setQuery('')
  }, [query, onAskAgent])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.stopPropagation()
    if (e.metaKey || e.ctrlKey) submitAgent()
    else submitNavigate()
  }

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    submitNavigate()
  }

  const dismissInfo = (): void => {
    setInfoOpen(false)
    try {
      localStorage.setItem(INFO_DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="newtab" data-screen-label="New Tab">
      <div className="newtab-ambient" aria-hidden />
      <div className="newtab-inner">
        <BrandMark size={44} className="newtab-brand newtab-enter newtab-enter-1" strokeWidth={1.8} />

        <div className="newtab-hello newtab-enter newtab-enter-2">
          {ntClock && (
            <div className="newtab-clock">
              {clock.time} · {clock.date}
            </div>
          )}
          <h1 className="newtab-greeting">{greeting}</h1>
        </div>

        {infoOpen && (
          <div className="newtab-info newtab-enter newtab-enter-2" role="status">
            <Info size={16} strokeWidth={1.75} className="newtab-info-icon" aria-hidden />
            <div className="newtab-info-copy">
              <strong>Search tip</strong>
              <span>
                Type anything and press Enter to search with {searchEngine}, or enter a full address.
                Use {mod}↵ (or the agent chip) to ask the agent instead.
              </span>
            </div>
            <button
              type="button"
              className="newtab-info-dismiss"
              aria-label="Dismiss tip"
              onClick={dismissInfo}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        <form className="newtab-search newtab-enter newtab-enter-3" onSubmit={onSubmit}>
          <Search size={15} strokeWidth={1.75} className="newtab-search-icon" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Search ${searchEngine} or enter address`}
            aria-label={`Search ${searchEngine} or enter address`}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="newtab-search-go"
            aria-label={`Search ${searchEngine}`}
            title={`Search ${searchEngine} (Enter)`}
          >
            Search
          </button>
          <button
            type="button"
            className="newtab-agent-chip"
            title={`${mod}+Enter to ask the agent`}
            onClick={submitAgent}
          >
            {mod}↵ agent
          </button>
        </form>

        {ntChips && (
          <div className="newtab-chips newtab-enter newtab-enter-4">
            {AGENT_CHIPS.map((text) => (
              <button
                key={text}
                type="button"
                className="newtab-chip"
                onClick={() => onAskAgent(text)}
              >
                {text}
              </button>
            ))}
          </div>
        )}

        {ntFavs && (
          favorites.length > 0 ? (
            <div className="newtab-favs newtab-enter newtab-enter-5">
              {favorites.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="newtab-fav"
                  title={f.title}
                  onClick={() => onNavigate(f.url)}
                >
                  <Favicon src={f.favicon} title={f.title} size={24} />
                  <span className="newtab-fav-title">{f.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="newtab-favs-empty newtab-enter newtab-enter-5">
              Pin sites with the star or {mod}D — they show up here.
            </p>
          )
        )}
      </div>
    </div>
  )
}
