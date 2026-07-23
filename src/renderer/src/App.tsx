import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSessionState, TabState } from '@shared/types'
import { TitleBar } from './components/TitleBar'
import { TabBar } from './components/TabBar'
import { Toolbar } from './components/Toolbar'
import { AgentPanel } from './components/AgentPanel'
import { StatusBar } from './components/StatusBar'
import { Sidebar } from './components/Sidebar'
import { NewTabPage } from './components/NewTabPage'
import { SettingsPage } from './components/SettingsPage'
import type { SettingsSection } from './lib/settings'
import { LibraryManager } from './components/LibraryManager'
import { useChromeMetrics } from './hooks/useChromeMetrics'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useTheme } from './hooks/useTheme'
import { useBookmarks } from './stores/bookmarks'
import { exportTrajectoryFile } from './lib/download'
import { platformCssToken } from './lib/platform'
import { isBlankUrl } from './lib/urls'
import './styles/app.css'

export default function App(): React.JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>([])
  const [agentOpen, setAgentOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [agent, setAgent] = useState<AgentSessionState | null>(null)
  const { theme, setTheme } = useTheme()
  const platform = platformCssToken(window.browgent?.platform)
  const contentRef = useRef<HTMLDivElement>(null)
  const creatingRef = useRef(false)
  const pinCurrentAsFavorite = useBookmarks((s) => s.pinCurrentAsFavorite)
  const isBookmarkedUrl = useBookmarks((s) => s.isBookmarkedUrl)
  const toggleFavorite = useBookmarks((s) => s.toggleFavorite)
  const isFavorite = useBookmarks((s) => s.isFavorite)
  const bookmarkItems = useBookmarks((s) => s.items)
  const bookmarkSpaces = useBookmarks((s) => s.spaces)
  const activeSpaceId = useBookmarks((s) => s.activeSpaceId)

  useChromeMetrics(contentRef, `${sidebarOpen}:${agentOpen}:${libraryOpen}:${settingsOpen}`)

  useEffect(() => {
    if (!window.browgent) return
    void window.browgent.getTabs().then(setTabs)
    void window.browgent.getAgentState().then((s) => {
      if (s) setAgent(s)
    })
    const unsubTabs = window.browgent.onTabsState(setTabs)
    const unsubAgent = window.browgent.onAgentState(setAgent)
    return () => {
      unsubTabs()
      unsubAgent()
    }
  }, [])

  const createTabOnce = useCallback(async (url?: string) => {
    if (creatingRef.current) return
    creatingRef.current = true
    try {
      await window.browgent.createTab(url)
      setSettingsOpen(false)
    } finally {
      window.setTimeout(() => {
        creatingRef.current = false
      }, 200)
    }
  }, [])

  const openUrl = useCallback(
    (url: string, newTab = false) => {
      setSettingsOpen(false)
      if (newTab) {
        void createTabOnce(url)
        return
      }
      const active = tabs.find((t) => t.isActive)
      if (active) {
        void window.browgent.navigate({ tabId: active.id, input: url })
      } else {
        void createTabOnce(url)
      }
    },
    [tabs, createTabOnce]
  )

  const openSettings = useCallback((section: SettingsSection = 'appearance') => {
    setSettingsSection(section)
    setSettingsOpen(true)
    setLibraryOpen(false)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const askAgent = useCallback(
    (text: string) => {
      const t = text.trim()
      if (!t) return
      setAgentOpen(true)
      setSettingsOpen(false)
      void window.browgent.sendAgentMessage(t, tabs.find((x) => x.isActive)?.id)
    },
    [tabs]
  )

  useAppShortcuts({
    tabs,
    agentStatus: agent?.status,
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
  })

  const activeTab = useMemo(() => tabs.find((t) => t.isActive), [tabs])
  const agentBusy =
    agent?.status === 'thinking' ||
    agent?.status === 'acting' ||
    agent?.status === 'waiting_human' ||
    agent?.status === 'paused'

  const bookmarkedId = activeTab?.url ? isBookmarkedUrl(activeTab.url) : null
  const favorited = bookmarkedId ? isFavorite(bookmarkedId) : false
  const showNewTab = !settingsOpen && isBlankUrl(activeTab?.url)

  // Settings sits over a live page — force-hide guest. New Tab uses about:blank (main-process).
  useEffect(() => {
    if (!window.browgent?.setGuestVisible) return
    void window.browgent.setGuestVisible(!settingsOpen)
  }, [settingsOpen])

  const favorites = useMemo(() => {
    const space =
      bookmarkSpaces.find((s) => s.id === activeSpaceId) ?? bookmarkSpaces[0]
    if (!space) return []
    return (space.favoriteIds ?? [])
      .map((id) => bookmarkItems[id])
      .filter(Boolean)
      .map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        favicon: item.favicon
      }))
  }, [bookmarkItems, bookmarkSpaces, activeSpaceId])

  const onToggleBookmark = useCallback(() => {
    if (!activeTab?.url || isBlankUrl(activeTab.url)) return
    if (bookmarkedId) {
      toggleFavorite(bookmarkedId)
      return
    }
    pinCurrentAsFavorite(activeTab.title, activeTab.url, activeTab.favicon)
  }, [activeTab, bookmarkedId, pinCurrentAsFavorite, toggleFavorite])

  return (
    <div
      className={`app-shell platform-${platform}${sidebarOpen ? ' sidebar-open' : ''}`}
    >
      <div className="ambient" aria-hidden />
      <div className="chrome-top">
        <TitleBar platform={platform} />
        {!sidebarOpen && (
          <TabBar
            tabs={tabs}
            onActivate={(id) => {
              setSettingsOpen(false)
              void window.browgent.activateTab(id)
            }}
            onClose={(id) => void window.browgent.closeTab(id)}
            onNew={() => void createTabOnce()}
          />
        )}
        <Toolbar
          activeTab={activeTab}
          agentOpen={agentOpen}
          agentBusy={agentBusy}
          sidebarOpen={sidebarOpen}
          settingsOpen={settingsOpen}
          themeOverlaySafe={settingsOpen || showNewTab}
          isBookmarked={Boolean(bookmarkedId)}
          isFavorited={favorited}
          theme={theme}
          onThemeChange={setTheme}
          onToggleAgent={() => setAgentOpen((v) => !v)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleBookmark={onToggleBookmark}
          onOpenSettings={() => openSettings('appearance')}
        />
      </div>

      <div className="body">
        <Sidebar
          tabs={tabs}
          open={sidebarOpen}
          libraryOpen={libraryOpen}
          onClose={() => setSidebarOpen(false)}
          onNewTab={() => void createTabOnce()}
          onActivateTab={(id) => {
            setSettingsOpen(false)
            void window.browgent.activateTab(id)
          }}
          onCloseTab={(id) => void window.browgent.closeTab(id)}
          onOpenUrl={openUrl}
          onToggleLibrary={() => setLibraryOpen((v) => !v)}
        />
        <LibraryManager
          open={libraryOpen && sidebarOpen}
          onClose={() => setLibraryOpen(false)}
          onOpenUrl={openUrl}
        />
        <div
          className="content-hole"
          ref={contentRef}
          aria-hidden={!settingsOpen && !showNewTab}
        >
          {settingsOpen ? (
            <SettingsPage
              theme={theme}
              onThemeChange={setTheme}
              section={settingsSection}
              onSectionChange={setSettingsSection}
              agent={agent}
              onClose={closeSettings}
              onExportTrajectory={() =>
                void exportTrajectoryFile().catch((e) => console.error('Export failed', e))
              }
            />
          ) : showNewTab ? (
            <NewTabPage
              onNavigate={(url) => openUrl(url)}
              onAskAgent={askAgent}
              favorites={favorites}
            />
          ) : (
            <div className="content-placeholder">
              <div className="content-placeholder-orb" />
              <p>Loading page…</p>
            </div>
          )}
        </div>
        <AgentPanel
          open={agentOpen}
          state={agent}
          onClose={() => setAgentOpen(false)}
          onOpenSettings={() => openSettings('agent')}
        />
      </div>

      <StatusBar
        activeTab={activeTab}
        agent={agent}
        tabCount={tabs.length}
        statusLabel={settingsOpen ? 'browgent://settings' : undefined}
      />
    </div>
  )
}
