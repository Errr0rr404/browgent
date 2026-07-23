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
import { FindBar } from './components/FindBar'
import { HistoryPage } from './components/HistoryPage'
import { DownloadsPanel } from './components/DownloadsPanel'
import type { DownloadItemState } from '@shared/types'
import { useChromeMetrics } from './hooks/useChromeMetrics'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useTheme } from './hooks/useTheme'
import { useBookmarks } from './stores/bookmarks'
import { useChromePrefs } from './stores/chromePrefs'
import { exportTrajectoryFile } from './lib/download'
import { platformCssToken } from './lib/platform'
import { isBlankUrl } from './lib/urls'
import { moodFromAgent } from './components/agent/AgentPet'
import { FloatingAgentPet } from './components/agent/AgentPet/FloatingAgentPet'
import './styles/app.css'

export default function App(): React.JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>([])
  // Closed by default so the floating companion is visible; open panel hides the pet
  const [agentOpen, setAgentOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  const [downloads, setDownloads] = useState<DownloadItemState[]>([])
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [agent, setAgent] = useState<AgentSessionState | null>(null)
  const { theme, setTheme } = useTheme()
  const agentPetVisible = useChromePrefs((s) => s.agentPetVisible)
  const agentPetX = useChromePrefs((s) => s.agentPetX)
  const agentPetY = useChromePrefs((s) => s.agentPetY)
  const setAgentPetVisible = useChromePrefs((s) => s.setAgentPetVisible)
  const setAgentPetPosition = useChromePrefs((s) => s.setAgentPetPosition)
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

  useChromeMetrics(
    contentRef,
    `${sidebarOpen}:${agentOpen}:${libraryOpen}:${settingsOpen}:${historyOpen}:${findOpen}:${downloadsOpen}`
  )

  useEffect(() => {
    if (!window.browgent) return
    void window.browgent.getTabs().then(setTabs)
    void window.browgent.getAgentState().then((s) => {
      if (s) setAgent(s)
    })
    void window.browgent.getDownloads?.().then(setDownloads).catch(() => {
      /* ignore */
    })
    void window.browgent.isFullScreen?.().then(setIsFullScreen).catch(() => {
      /* ignore */
    })
    const unsubTabs = window.browgent.onTabsState(setTabs)
    const unsubAgent = window.browgent.onAgentState(setAgent)
    const unsubFs = window.browgent.onFullScreenChanged?.(setIsFullScreen)
    const unsubDl = window.browgent.onDownloadsState?.(setDownloads)
    return () => {
      unsubTabs()
      unsubAgent()
      unsubFs?.()
      unsubDl?.()
    }
  }, [])

  useEffect(() => {
    if (!window.browgent?.onPetClick) return
    const unsubClick = window.browgent.onPetClick(() => {
      setAgentOpen((v) => !v)
    })
    const unsubHide = window.browgent.onPetHide(() => {
      setAgentPetVisible(false)
    })
    const unsubMoved = window.browgent.onPetMoved(({ x, y }) => {
      setAgentPetPosition(x, y)
    })
    return () => {
      unsubClick()
      unsubHide()
      unsubMoved()
    }
  }, [setAgentPetVisible, setAgentPetPosition])

  const createTabOnce = useCallback(async (url?: string) => {
    if (creatingRef.current) return
    creatingRef.current = true
    try {
      await window.browgent.createTab(url)
      setSettingsOpen(false)
      setHistoryOpen(false)
    } finally {
      window.setTimeout(() => {
        creatingRef.current = false
      }, 200)
    }
  }, [])

  const openUrl = useCallback(
    (url: string, newTab = false) => {
      let target = url.trim()
      if (!target) return
      // Favorites / pins often store bare hosts — normalize before navigate
      if (!/^https?:\/\//i.test(target) && !target.startsWith('about:')) {
        target = target.startsWith('//') ? `https:${target}` : `https://${target}`
      }
      setSettingsOpen(false)
      setHistoryOpen(false)
      if (newTab) {
        void createTabOnce(target)
        return
      }
      const active = tabs.find((t) => t.isActive)
      if (active?.id) {
        void window.browgent
          .navigate({ tabId: active.id, input: target })
          .then((ok) => {
            if (!ok) void createTabOnce(target)
          })
          .catch(() => {
            void createTabOnce(target)
          })
      } else {
        void createTabOnce(target)
      }
    },
    [tabs, createTabOnce]
  )

  const openSettings = useCallback((section: SettingsSection = 'appearance') => {
    setSettingsSection(section)
    setSettingsOpen(true)
    setHistoryOpen(false)
    setLibraryOpen(false)
    setDownloadsOpen(false)
  }, [])

  /** Toolbar / ⌘, : open if closed, close if already open. */
  const toggleSettings = useCallback((section: SettingsSection = 'appearance') => {
    setSettingsOpen((open) => {
      if (open) return false
      setSettingsSection(section)
      setLibraryOpen(false)
      setHistoryOpen(false)
      setDownloadsOpen(false)
      return true
    })
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const openHistory = useCallback(() => {
    setHistoryOpen(true)
    setSettingsOpen(false)
    setLibraryOpen(false)
    setDownloadsOpen(false)
    setFindOpen(false)
  }, [])

  const toggleHistory = useCallback(() => {
    setHistoryOpen((open) => {
      if (open) return false
      setSettingsOpen(false)
      setLibraryOpen(false)
      setDownloadsOpen(false)
      setFindOpen(false)
      return true
    })
  }, [])

  const openDownloads = useCallback(() => {
    setDownloadsOpen(true)
  }, [])

  const toggleDownloads = useCallback(() => {
    setDownloadsOpen((v) => !v)
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
    historyOpen,
    findOpen,
    downloadsOpen,
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
  const chromeOverlay = settingsOpen || historyOpen
  const showNewTab = !chromeOverlay && isBlankUrl(activeTab?.url)
  // Guest WebContentsView covers the content hole on real pages — native overlay there.
  // On New Tab / Settings the guest is hidden — React float is reliable.
  const guestCoveringPage = !chromeOverlay && !showNewTab
  // Hide React pet on Settings/History (chrome overlays) so it does not steal clicks
  const showReactPet = agentPetVisible && !agentOpen && !guestCoveringPage && !chromeOverlay
  const downloadActiveCount = useMemo(
    () => downloads.filter((d) => d.state === 'progressing').length,
    [downloads]
  )

  // Native overlay: only when a real page is showing (floats above WebContentsView)
  useEffect(() => {
    if (!window.browgent?.configurePet) return
    const show = agentPetVisible && !agentOpen && guestCoveringPage
    const mood = moodFromAgent(agent?.status)
    void window.browgent.configurePet({
      visible: show,
      theme,
      mood,
      ...(agentPetX >= 0 ? { x: agentPetX } : {}),
      ...(agentPetY >= 0 ? { y: agentPetY } : {})
    })
  }, [
    agentPetVisible,
    agentOpen,
    guestCoveringPage,
    theme,
    agent?.status,
    agentPetX,
    agentPetY
  ])

  // Settings / History sit over a live page — force-hide guest. New Tab uses about:blank.
  useEffect(() => {
    if (!window.browgent?.setGuestVisible) return
    void window.browgent.setGuestVisible(!chromeOverlay)
  }, [chromeOverlay])

  useEffect(() => {
    if (chromeOverlay || showNewTab) setFindOpen(false)
  }, [chromeOverlay, showNewTab])

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
      className={`app-shell platform-${platform}${sidebarOpen ? ' sidebar-open' : ''}${isFullScreen ? ' is-fullscreen' : ''}`}
    >
      <div className="ambient" aria-hidden />
      <div className="chrome-top">
        <TitleBar platform={platform} />
        {!sidebarOpen && (
          <TabBar
            tabs={tabs}
            onActivate={(id) => {
              setSettingsOpen(false)
              setHistoryOpen(false)
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
          historyOpen={historyOpen}
          downloadsOpen={downloadsOpen}
          downloadActiveCount={downloadActiveCount}
          themeOverlaySafe={chromeOverlay || showNewTab}
          agentPetVisible={agentPetVisible}
          isBookmarked={Boolean(bookmarkedId)}
          isFavorited={favorited}
          theme={theme}
          onThemeChange={setTheme}
          onToggleAgent={() => setAgentOpen((v) => !v)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleBookmark={onToggleBookmark}
          onOpenSettings={() => openSettings('appearance')}
          onToggleSettings={() => toggleSettings('appearance')}
          onToggleHistory={toggleHistory}
          onOpenHistory={openHistory}
          onToggleDownloads={toggleDownloads}
          onOpenDownloads={openDownloads}
        />
        <FindBar
          open={findOpen && !chromeOverlay && !showNewTab}
          tabId={activeTab?.id}
          onClose={() => setFindOpen(false)}
        />
        <DownloadsPanel open={downloadsOpen} onClose={() => setDownloadsOpen(false)} />
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
            setHistoryOpen(false)
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
          aria-hidden={!chromeOverlay && !showNewTab}
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
          ) : historyOpen ? (
            <HistoryPage
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              onOpenUrl={openUrl}
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
        statusLabel={
          settingsOpen
            ? 'browgent://settings'
            : historyOpen
              ? 'browgent://history'
              : undefined
        }
        onZoomIn={() => void window.browgent.zoomIn?.(activeTab?.id)}
        onZoomOut={() => void window.browgent.zoomOut?.(activeTab?.id)}
        onZoomReset={() => void window.browgent.zoomReset?.(activeTab?.id)}
      />

      {showReactPet && (
        <FloatingAgentPet
          theme={theme}
          agentOpen={agentOpen}
          agentStatus={agent?.status}
          onToggle={() => setAgentOpen((v) => !v)}
        />
      )}
    </div>
  )
}
