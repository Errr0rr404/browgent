import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Favicon } from './Favicon'
import { BrandMark } from './BrandMark'
import {
  resolveOmniboxInput,
  useChromePrefs
} from '../stores/chromePrefs'
import { platformModKey } from '../lib/platform'
import '../styles/chrome-pages.css'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const mod = useMemo(() => platformModKey(), [])

  useEffect(() => {
    if (!ntClock) return
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [ntClock])

  // Focus the search field when the New Tab surface mounts
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

  const submitNavigate = useCallback(() => {
    const raw = query.trim()
    if (!raw) return
    const url = resolveOmniboxInput(raw, searchEngine)
    if (url) {
      onNavigate(url)
      setQuery('')
    }
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
    if (e.metaKey || e.ctrlKey) submitAgent()
    else submitNavigate()
  }

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    submitNavigate()
  }

  return (
    <div className="newtab" data-screen-label="New Tab">
      <div className="newtab-ambient" aria-hidden />
      <div className="newtab-inner">
        <BrandMark size={44} className="newtab-brand" strokeWidth={1.8} />

        <div className="newtab-hello">
          {ntClock && (
            <div className="newtab-clock">
              {clock.time} · {clock.date}
            </div>
          )}
          <h1 className="newtab-greeting">{greeting}</h1>
        </div>

        <form className="newtab-search" onSubmit={onSubmit}>
          <Search size={15} strokeWidth={1.75} className="newtab-search-icon" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search, enter address, or ask the agent"
            aria-label="Search or ask the agent"
            autoComplete="off"
            spellCheck={false}
          />
          <span
            className="newtab-agent-chip"
            title={`${mod}+Enter to ask the agent`}
          >
            {mod}↵ agent
          </span>
        </form>

        {ntChips && (
          <div className="newtab-chips">
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
            <div className="newtab-favs">
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
            <p className="newtab-favs-empty">
              Pin sites with the star or {mod}D — they show up here.
            </p>
          )
        )}
      </div>
    </div>
  )
}
