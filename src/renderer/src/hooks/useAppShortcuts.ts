import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { AgentSessionState, TabState } from '@shared/types'
import type { BookmarkId } from '@shared/bookmarks'
import { isBlankUrl } from '../lib/urls'
import type { SettingsSection } from '../lib/settings'

interface Options {
  tabs: TabState[]
  agentStatus: AgentSessionState['status'] | undefined
  settingsOpen: boolean
  libraryOpen: boolean
  historyOpen?: boolean
  findOpen?: boolean
  downloadsOpen?: boolean
  createTabOnce: (url?: string) => void | Promise<void>
  openSettings: (section?: SettingsSection) => void
  /** Preferred for ⌘, — toggles closed if already open */
  toggleSettings?: (section?: SettingsSection) => void
  closeSettings: () => void
  setAgentOpen: Dispatch<SetStateAction<boolean>>
  setSidebarOpen: Dispatch<SetStateAction<boolean>>
  setLibraryOpen: Dispatch<SetStateAction<boolean>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  setHistoryOpen?: Dispatch<SetStateAction<boolean>>
  setFindOpen?: Dispatch<SetStateAction<boolean>>
  setDownloadsOpen?: Dispatch<SetStateAction<boolean>>
  isBookmarkedUrl: (url: string) => BookmarkId | null
  toggleFavorite: (id: BookmarkId) => void
  pinCurrentAsFavorite: (title: string, url: string, favicon?: string) => void
  onSummarizePage?: () => void
}

/** Global chrome keyboard shortcuts (⌘T/W/L/J, Esc, tab switch, …). */
export function useAppShortcuts({
  tabs,
  agentStatus,
  settingsOpen,
  libraryOpen,
  historyOpen = false,
  findOpen = false,
  downloadsOpen = false,
  createTabOnce,
  openSettings,
  toggleSettings,
  closeSettings,
  setAgentOpen,
  setSidebarOpen,
  setLibraryOpen,
  setSettingsOpen,
  setHistoryOpen,
  setFindOpen,
  setDownloadsOpen,
  isBookmarkedUrl,
  toggleFavorite,
  pinCurrentAsFavorite,
  onSummarizePage
}: Options): void {
  useEffect(() => {
    // ⌘ on macOS vs Ctrl elsewhere. On macOS, Ctrl+W / Ctrl+R are readline / text-edit
    // bindings, so destructive chrome shortcuts require ⌘ specifically (see below).
    const isMac = window.browgent?.platform === 'darwin'
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if (e.key === 'Escape') {
        if (findOpen) {
          e.preventDefault()
          setFindOpen?.(false)
          return
        }
        if (downloadsOpen) {
          e.preventDefault()
          setDownloadsOpen?.(false)
          return
        }
        if (historyOpen) {
          e.preventDefault()
          setHistoryOpen?.(false)
          return
        }
        if (settingsOpen) {
          e.preventDefault()
          closeSettings()
          return
        }
        if (libraryOpen) {
          e.preventDefault()
          setLibraryOpen(false)
          return
        }
        if (target?.classList.contains('omnibox')) {
          e.preventDefault()
          target.blur()
          return
        }
        if (
          !typing &&
          (agentStatus === 'thinking' ||
            agentStatus === 'acting' ||
            agentStatus === 'paused' ||
            agentStatus === 'waiting_human')
        ) {
          e.preventDefault()
          void window.browgent.stopAgent()
          return
        }
      }

      if (!mod) return

      // Guard EVERY modifier shortcut below while the user is typing in the agent
      // composer or the sidebar rename input — otherwise ⌘W closes the tab and ⌘R
      // reloads it mid-sentence. Escape (handled above) and the zoom / back-forward
      // branches keep their own explicit `!typing` rules.
      if (typing) return

      // With Shift, Chromium reports e.key as "J"/"S" — always compare lowercased.
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (key === 't') {
        e.preventDefault()
        void createTabOnce()
      }
      // Destructive: require ⌘ on macOS so Ctrl+W (delete-word) never closes a tab.
      if (key === 'w' && (!isMac || e.metaKey)) {
        e.preventDefault()
        if (historyOpen) {
          setHistoryOpen?.(false)
          return
        }
        if (settingsOpen) {
          closeSettings()
          return
        }
        const active = tabs.find((t) => t.isActive)
        if (active) void window.browgent.closeTab(active.id)
      }
      if (key === 'l') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('.omnibox')
        input?.focus()
        input?.select()
      }

      if (key === 'j' && e.shiftKey) {
        e.preventDefault()
        setDownloadsOpen?.((v) => !v)
        return
      }
      if (key === 'j') {
        e.preventDefault()
        setAgentOpen((v) => !v)
      }
      if (key === 's' && e.shiftKey) {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      }
      if (key === ',' && !e.shiftKey) {
        e.preventDefault()
        if (toggleSettings) toggleSettings('appearance')
        else openSettings('appearance')
      }
      if (key === 'd' && !e.shiftKey) {
        e.preventDefault()
        const active = tabs.find((t) => t.isActive)
        if (!active?.url || isBlankUrl(active.url)) return
        const existing = isBookmarkedUrl(active.url)
        if (existing) toggleFavorite(existing)
        else pinCurrentAsFavorite(active.title, active.url, active.favicon)
      }
      // Destructive: require ⌘ on macOS so Ctrl+R (reverse-search) never reloads.
      if (key === 'r' && !e.shiftKey && (!isMac || e.metaKey)) {
        e.preventDefault()
        if (settingsOpen || historyOpen) return
        const active = tabs.find((t) => t.isActive)
        if (active && !isBlankUrl(active.url)) void window.browgent.reload(active.id)
      }
      if (key === 'f' && !e.shiftKey) {
        e.preventDefault()
        if (settingsOpen || historyOpen) return
        const active = tabs.find((t) => t.isActive)
        if (!active || isBlankUrl(active.url)) return
        setFindOpen?.((v) => !v)
      }
      if (key === 'y' && !e.shiftKey) {
        e.preventDefault()
        setHistoryOpen?.((v) => !v)
        setSettingsOpen(false)
        setDownloadsOpen?.(false)
      }
      if (key === 'u' && e.shiftKey) {
        e.preventDefault()
        onSummarizePage?.()
        return
      }
      if (e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        if (settingsOpen || historyOpen) return
        const active = tabs.find((t) => t.isActive)
        if (active && !isBlankUrl(active.url)) void window.browgent.printPage?.(active.id)
      }
      // Zoom: ⌘+ / ⌘= / ⌘- / ⌘0
      if (!typing && (e.key === '=' || e.key === '+' || e.code === 'Equal')) {
        e.preventDefault()
        if (settingsOpen || historyOpen) return
        void window.browgent.zoomIn?.(tabs.find((t) => t.isActive)?.id)
      }
      if (!typing && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        if (settingsOpen || historyOpen) return
        void window.browgent.zoomOut?.(tabs.find((t) => t.isActive)?.id)
      }
      if (!typing && e.key === '0') {
        e.preventDefault()
        if (settingsOpen || historyOpen) return
        void window.browgent.zoomReset?.(tabs.find((t) => t.isActive)?.id)
      }
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = e.key === '9' ? tabs.length - 1 : Number(e.key) - 1
        const tab = tabs[idx]
        if (tab) {
          setSettingsOpen(false)
          setHistoryOpen?.(false)
          void window.browgent.activateTab(tab.id)
        }
      }
      if (!typing && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        if (settingsOpen || historyOpen) return
        const active = tabs.find((t) => t.isActive)
        if (e.key === '[') void window.browgent.goBack(active?.id)
        else void window.browgent.goForward(active?.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    tabs,
    createTabOnce,
    isBookmarkedUrl,
    toggleFavorite,
    pinCurrentAsFavorite,
    agentStatus,
    settingsOpen,
    libraryOpen,
    historyOpen,
    findOpen,
    downloadsOpen,
    openSettings,
    toggleSettings,
    closeSettings,
    setAgentOpen,
    setSidebarOpen,
    setLibraryOpen,
    setSettingsOpen,
    setHistoryOpen,
    setFindOpen,
    setDownloadsOpen,
    onSummarizePage
  ])
}
