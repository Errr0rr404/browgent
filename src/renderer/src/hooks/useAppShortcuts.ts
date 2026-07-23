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
  createTabOnce: (url?: string) => void | Promise<void>
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  setAgentOpen: Dispatch<SetStateAction<boolean>>
  setSidebarOpen: Dispatch<SetStateAction<boolean>>
  setLibraryOpen: Dispatch<SetStateAction<boolean>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  isBookmarkedUrl: (url: string) => BookmarkId | null
  toggleFavorite: (id: BookmarkId) => void
  pinCurrentAsFavorite: (title: string, url: string, favicon?: string) => void
}

/** Global chrome keyboard shortcuts (⌘T/W/L/J, Esc, tab switch, …). */
export function useAppShortcuts({
  tabs,
  agentStatus,
  settingsOpen,
  libraryOpen,
  createTabOnce,
  openSettings,
  closeSettings,
  setAgentOpen,
  setSidebarOpen,
  setLibraryOpen,
  setSettingsOpen,
  isBookmarkedUrl,
  toggleFavorite,
  pinCurrentAsFavorite
}: Options): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if (e.key === 'Escape') {
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

      if (e.key === 't') {
        e.preventDefault()
        void createTabOnce()
      }
      if (e.key === 'w') {
        e.preventDefault()
        if (settingsOpen) {
          closeSettings()
          return
        }
        const active = tabs.find((t) => t.isActive)
        if (active) void window.browgent.closeTab(active.id)
      }
      if (e.key === 'l') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('.omnibox')
        input?.focus()
        input?.select()
      }
      if (e.key === 'j') {
        e.preventDefault()
        setAgentOpen((v) => !v)
      }
      if (e.key === 's' && e.shiftKey) {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      }
      if (e.key === ',' && !e.shiftKey) {
        e.preventDefault()
        openSettings('appearance')
      }
      if (e.key === 'd' && !e.shiftKey) {
        e.preventDefault()
        const active = tabs.find((t) => t.isActive)
        if (!active?.url || isBlankUrl(active.url)) return
        const existing = isBookmarkedUrl(active.url)
        if (existing) toggleFavorite(existing)
        else pinCurrentAsFavorite(active.title, active.url, active.favicon)
      }
      if (e.key === 'r' && !e.shiftKey) {
        e.preventDefault()
        if (settingsOpen) return
        const active = tabs.find((t) => t.isActive)
        if (active && !isBlankUrl(active.url)) void window.browgent.reload(active.id)
      }
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = e.key === '9' ? tabs.length - 1 : Number(e.key) - 1
        const tab = tabs[idx]
        if (tab) {
          setSettingsOpen(false)
          void window.browgent.activateTab(tab.id)
        }
      }
      if (!typing && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        if (settingsOpen) return
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
    openSettings,
    closeSettings,
    setAgentOpen,
    setSidebarOpen,
    setLibraryOpen,
    setSettingsOpen
  ])
}
