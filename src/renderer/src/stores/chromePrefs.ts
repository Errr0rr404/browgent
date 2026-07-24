import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  normalizePetFormPref,
  type PetFormPref
} from '../components/agent/AgentPet/pet-forms'

export type SearchEngine = 'Google' | 'DuckDuckGo' | 'Brave' | 'Kagi'

/** How dense the agent console should feel. */
export type AgentConsoleDensity = 'comfortable' | 'compact'

export type { PetFormPref }

export interface ChromePrefs {
  greetingName: string
  ntClock: boolean
  ntFavs: boolean
  ntChips: boolean
  searchEngine: SearchEngine
  /** When true, themed pet is the agent entry (toolbar Agent button hidden). */
  agentPetVisible: boolean
  /** Last floating pet position (window content coords). -1 = default bottom-right. */
  agentPetX: number
  agentPetY: number
  /** Morphing companion form: cycle through mark/invader/cloud or lock one. */
  agentPetForm: PetFormPref
  /** Agent console display */
  agentDensity: AgentConsoleDensity
  agentShowTimestamps: boolean
  agentShowActionsInChat: boolean
  agentCollapseLong: boolean
  agentShowModeBar: boolean
  agentShowComposerHints: boolean
  /** First-run welcome dismissed */
  onboardingDismissed: boolean
  /** Opt-in anonymous counter telemetry (no page content) */
  telemetryOptIn: boolean
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
  // Google for omnibox / new tab (matches Chrome expectations).
  // Agent web-search still uses DuckDuckGo by default (see buildAgentSearchUrl)
  // to avoid reCAPTCHA walls during automated multi-step runs.
  searchEngine: 'Google',
  agentPetVisible: true,
  agentPetX: -1,
  agentPetY: -1,
  agentPetForm: 'cycle',
  agentDensity: 'compact',
  agentShowTimestamps: false,
  agentShowActionsInChat: true,
  agentCollapseLong: true,
  agentShowModeBar: true,
  agentShowComposerHints: false,
  onboardingDismissed: false,
  telemetryOptIn: false
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
  setAgentPetVisible: (on: boolean) => void
  setAgentPetPosition: (x: number, y: number) => void
  setAgentPetForm: (form: PetFormPref) => void
  setAgentDensity: (d: AgentConsoleDensity) => void
  setAgentShowTimestamps: (on: boolean) => void
  setAgentShowActionsInChat: (on: boolean) => void
  setAgentCollapseLong: (on: boolean) => void
  setAgentShowModeBar: (on: boolean) => void
  setAgentShowComposerHints: (on: boolean) => void
  setOnboardingDismissed: (on: boolean) => void
  setTelemetryOptIn: (on: boolean) => void
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
      setAgentPetVisible: (on) => set({ agentPetVisible: on }),
      setAgentPetPosition: (x, y) => set({ agentPetX: x, agentPetY: y }),
      setAgentPetForm: (form) => set({ agentPetForm: form }),
      setAgentDensity: (d) => set({ agentDensity: d }),
      setAgentShowTimestamps: (on) => set({ agentShowTimestamps: on }),
      setAgentShowActionsInChat: (on) => set({ agentShowActionsInChat: on }),
      setAgentCollapseLong: (on) => set({ agentCollapseLong: on }),
      setAgentShowModeBar: (on) => set({ agentShowModeBar: on }),
      setAgentShowComposerHints: (on) => set({ agentShowComposerHints: on }),
      setOnboardingDismissed: (on) => set({ onboardingDismissed: on }),
      setTelemetryOptIn: (on) => set({ telemetryOptIn: on }),
      patch: (partial) => set(partial)
    }),
    {
      name: 'browgent.chromePrefs',
      version: 8,
      partialize: (state) => ({
        greetingName: state.greetingName,
        ntClock: state.ntClock,
        ntFavs: state.ntFavs,
        ntChips: state.ntChips,
        searchEngine: state.searchEngine,
        agentPetVisible: state.agentPetVisible,
        agentPetX: state.agentPetX,
        agentPetY: state.agentPetY,
        agentPetForm: state.agentPetForm,
        agentDensity: state.agentDensity,
        agentShowTimestamps: state.agentShowTimestamps,
        agentShowActionsInChat: state.agentShowActionsInChat,
        agentCollapseLong: state.agentCollapseLong,
        agentShowModeBar: state.agentShowModeBar,
        agentShowComposerHints: state.agentShowComposerHints,
        onboardingDismissed: state.onboardingDismissed,
        telemetryOptIn: state.telemetryOptIn
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<ChromePrefs>
        if (version < 6) {
          return {
            ...DEFAULT_CHROME_PREFS,
            ...p,
            agentPetVisible: pickBool(
              p.agentPetVisible,
              DEFAULT_CHROME_PREFS.agentPetVisible
            ),
            agentPetX:
              typeof p.agentPetX === 'number' ? p.agentPetX : DEFAULT_CHROME_PREFS.agentPetX,
            agentPetY:
              typeof p.agentPetY === 'number' ? p.agentPetY : DEFAULT_CHROME_PREFS.agentPetY,
            agentPetForm: normalizePetFormPref(p.agentPetForm),
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
            ),
            onboardingDismissed: pickBool(p.onboardingDismissed, false),
            telemetryOptIn: pickBool(p.telemetryOptIn, false),
            searchEngine: 'Google'
          }
        }
        if (version < 7) {
          // Historical: briefly forced DDG for captcha; superseded by v8 → Google.
          const engine = p.searchEngine
          return {
            ...p,
            searchEngine: isSearchEngine(engine ?? '') ? engine! : 'Google'
          } as ChromePrefs
        }
        if (version < 8) {
          // Restore Google as the user-facing default (omnibox / new tab).
          // Users who deliberately picked Brave/Kagi keep their choice.
          const engine = p.searchEngine
          return {
            ...p,
            searchEngine:
              engine === 'DuckDuckGo' || !isSearchEngine(engine ?? '')
                ? 'Google'
                : engine
          } as ChromePrefs
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
          agentPetVisible: pickBool(p.agentPetVisible, current.agentPetVisible),
          agentPetX: typeof p.agentPetX === 'number' ? p.agentPetX : current.agentPetX,
          agentPetY: typeof p.agentPetY === 'number' ? p.agentPetY : current.agentPetY,
          agentPetForm: normalizePetFormPref(
            p.agentPetForm !== undefined ? p.agentPetForm : current.agentPetForm
          ),
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
          ),
          onboardingDismissed: pickBool(p.onboardingDismissed, current.onboardingDismissed),
          telemetryOptIn: pickBool(p.telemetryOptIn, current.telemetryOptIn)
        }
      }
    }
  )
)
