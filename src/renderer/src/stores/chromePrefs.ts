import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SearchEngine = 'Google' | 'DuckDuckGo' | 'Brave' | 'Kagi'

/** How dense the agent console should feel. */
export type AgentConsoleDensity = 'comfortable' | 'compact'

export interface ChromePrefs {
  greetingName: string
  ntClock: boolean
  ntFavs: boolean
  ntChips: boolean
  searchEngine: SearchEngine
  /** Agent console display */
  agentDensity: AgentConsoleDensity
  agentShowTimestamps: boolean
  agentShowActionsInChat: boolean
  agentCollapseLong: boolean
  agentShowModeBar: boolean
  agentShowComposerHints: boolean
}

export const SEARCH_ENGINES: SearchEngine[] = [
  'Google',
  'DuckDuckGo',
  'Brave',
  'Kagi'
]

const SEARCH_URLS: Record<SearchEngine, string> = {
  Google: 'https://www.google.com/search?q=',
  DuckDuckGo: 'https://duckduckgo.com/?q=',
  Brave: 'https://search.brave.com/search?q=',
  Kagi: 'https://kagi.com/search?q='
}

export const DEFAULT_CHROME_PREFS: ChromePrefs = {
  greetingName: '',
  ntClock: true,
  ntFavs: true,
  ntChips: true,
  searchEngine: 'Google',
  agentDensity: 'compact',
  agentShowTimestamps: false,
  agentShowActionsInChat: true,
  agentCollapseLong: true,
  agentShowModeBar: true,
  agentShowComposerHints: false
}

export function buildSearchUrl(engine: SearchEngine, query: string): string {
  const base = SEARCH_URLS[engine] ?? SEARCH_URLS.Google
  return `${base}${encodeURIComponent(query.trim())}`
}

/** Design rule: multi-word or no-dot → search; otherwise treat as URL/host. */
export function resolveOmniboxInput(
  raw: string,
  engine: SearchEngine
): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/\s/.test(trimmed) || !trimmed.includes('.')) {
    return buildSearchUrl(engine, trimmed)
  }
  return trimmed.startsWith('//') ? `https:${trimmed}` : `https://${trimmed}`
}

export function isSearchEngine(v: string): v is SearchEngine {
  return (SEARCH_ENGINES as string[]).includes(v)
}

export function isAgentDensity(v: string): v is AgentConsoleDensity {
  return v === 'comfortable' || v === 'compact'
}

interface ChromePrefsStore extends ChromePrefs {
  setGreetingName: (name: string) => void
  setNtClock: (on: boolean) => void
  setNtFavs: (on: boolean) => void
  setNtChips: (on: boolean) => void
  setSearchEngine: (engine: SearchEngine) => void
  setAgentDensity: (d: AgentConsoleDensity) => void
  setAgentShowTimestamps: (on: boolean) => void
  setAgentShowActionsInChat: (on: boolean) => void
  setAgentCollapseLong: (on: boolean) => void
  setAgentShowModeBar: (on: boolean) => void
  setAgentShowComposerHints: (on: boolean) => void
  patch: (partial: Partial<ChromePrefs>) => void
}

function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

export const useChromePrefs = create<ChromePrefsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_CHROME_PREFS,

      setGreetingName: (name) => set({ greetingName: name }),
      setNtClock: (on) => set({ ntClock: on }),
      setNtFavs: (on) => set({ ntFavs: on }),
      setNtChips: (on) => set({ ntChips: on }),
      setSearchEngine: (engine) => set({ searchEngine: engine }),
      setAgentDensity: (d) => set({ agentDensity: d }),
      setAgentShowTimestamps: (on) => set({ agentShowTimestamps: on }),
      setAgentShowActionsInChat: (on) => set({ agentShowActionsInChat: on }),
      setAgentCollapseLong: (on) => set({ agentCollapseLong: on }),
      setAgentShowModeBar: (on) => set({ agentShowModeBar: on }),
      setAgentShowComposerHints: (on) => set({ agentShowComposerHints: on }),
      patch: (partial) => set(partial)
    }),
    {
      name: 'browgent.chromePrefs',
      version: 2,
      partialize: (state) => ({
        greetingName: state.greetingName,
        ntClock: state.ntClock,
        ntFavs: state.ntFavs,
        ntChips: state.ntChips,
        searchEngine: state.searchEngine,
        agentDensity: state.agentDensity,
        agentShowTimestamps: state.agentShowTimestamps,
        agentShowActionsInChat: state.agentShowActionsInChat,
        agentCollapseLong: state.agentCollapseLong,
        agentShowModeBar: state.agentShowModeBar,
        agentShowComposerHints: state.agentShowComposerHints
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<ChromePrefs>
        if (version < 2) {
          return {
            ...DEFAULT_CHROME_PREFS,
            ...p,
            agentDensity: isAgentDensity(p.agentDensity ?? '')
              ? p.agentDensity!
              : DEFAULT_CHROME_PREFS.agentDensity,
            agentShowTimestamps: pickBool(
              p.agentShowTimestamps,
              DEFAULT_CHROME_PREFS.agentShowTimestamps
            ),
            agentShowActionsInChat: pickBool(
              p.agentShowActionsInChat,
              DEFAULT_CHROME_PREFS.agentShowActionsInChat
            ),
            agentCollapseLong: pickBool(
              p.agentCollapseLong,
              DEFAULT_CHROME_PREFS.agentCollapseLong
            ),
            agentShowModeBar: pickBool(
              p.agentShowModeBar,
              DEFAULT_CHROME_PREFS.agentShowModeBar
            ),
            agentShowComposerHints: pickBool(
              p.agentShowComposerHints,
              DEFAULT_CHROME_PREFS.agentShowComposerHints
            )
          }
        }
        return p as ChromePrefs
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ChromePrefs>
        return {
          ...current,
          greetingName:
            typeof p.greetingName === 'string' ? p.greetingName : current.greetingName,
          ntClock: pickBool(p.ntClock, current.ntClock),
          ntFavs: pickBool(p.ntFavs, current.ntFavs),
          ntChips: pickBool(p.ntChips, current.ntChips),
          searchEngine: isSearchEngine(p.searchEngine ?? '')
            ? p.searchEngine!
            : current.searchEngine,
          agentDensity: isAgentDensity(p.agentDensity ?? '')
            ? p.agentDensity!
            : current.agentDensity,
          agentShowTimestamps: pickBool(p.agentShowTimestamps, current.agentShowTimestamps),
          agentShowActionsInChat: pickBool(
            p.agentShowActionsInChat,
            current.agentShowActionsInChat
          ),
          agentCollapseLong: pickBool(p.agentCollapseLong, current.agentCollapseLong),
          agentShowModeBar: pickBool(p.agentShowModeBar, current.agentShowModeBar),
          agentShowComposerHints: pickBool(
            p.agentShowComposerHints,
            current.agentShowComposerHints
          )
        }
      }
    }
  )
)
