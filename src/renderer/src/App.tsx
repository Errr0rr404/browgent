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
import { FirstRunModal } from './components/FirstRunModal'
import { Toast, type ToastMessage } from './components/Toast'
import type { AgentMode } from '@shared/policies'
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
  const agentPetForm = useChromePrefs((s) => s.agentPetForm)
  const setAgentPetVisible = useChromePrefs((s) => s.setAgentPetVisible)
  const setAgentPetPosition = useChromePrefs((s) => s.setAgentPetPosition)
  const onboardingDismissed = useChromePrefs((s) => s.onboardingDismissed)
  const setOnboardingDismissed = useChromePrefs((s) => s.setOnboardingDismissed)
  const telemetryOptIn = useChromePrefs((s) => s.telemetryOptIn)
  const [prefsHydrated, setPrefsHydrated] = useState(() => useChromePrefs.persist.hasHydrated())
  // Toast queue: show one at a time and advance on dismiss so rapid messages are not
  // silently dropped. A monotonic counter supplies ids (Date.now() could collide).
  const [toastQueue, setToastQueue] = useState<ToastMessage[]>([])
  const toastIdRef = useRef(0)
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
    if (!window.browgent) return
    // All three pet listeners are optional on the preload surface — subscribe and
    // unsubscribe consistently so a missing method never throws mid-effect (before,
    // only onPetClick was guarded while onPetHide/onPetMoved were called directly).
    const unsubClick = window.browgent.onPetClick?.(() => {
      setAgentOpen((v) => !v)
    })
    const unsubHide = window.browgent.onPetHide?.(() => {
      setAgentPetVisible(false)
    })
    const unsubMoved = window.browgent.onPetMoved?.(({ x, y }) => {
      setAgentPetPosition(x, y)
    })
    return () => {
      unsubClick?.()
      unsubHide?.()
      unsubMoved?.()
    }
  }, [setAgentPetVisible, setAgentPetPosition])

  const createTabOnce = useCallback(async (url?: string) => {
    if (creatingRef.current) return
    if (!window.browgent?.createTab) {
      console.error('[browgent] createTab unavailable — preload failed to load')
      return
    }
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
      if (active?.id && window.browgent?.navigate) {
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

  const pushToast = useCallback((kind: ToastMessage['kind'], text: string) => {
    const id = `toast-${(toastIdRef.current += 1)}`
    setToastQueue((q) => [...q, { id, kind, text }])
  }, [])

  // Drop the head; the next queued message (if any) surfaces on the next render.
  const dismissToast = useCallback(() => {
    setToastQueue((q) => q.slice(1))
  }, [])

  const currentToast = toastQueue[0] ?? null

  const askAgent = useCallback(
    (text: string): Promise<void> => {
      const t = text.trim()
      if (!t) return Promise.resolve()
      setAgentOpen(true)
      setSettingsOpen(false)
      if (!window.browgent?.sendAgentMessage) {
        console.error('[browgent] sendAgentMessage unavailable — preload failed to load')
        return Promise.reject(new Error('sendAgentMessage unavailable'))
      }
      return window.browgent
        .sendAgentMessage(t, tabs.find((x) => x.isActive)?.id)
        .catch((err) => {
          console.error('[browgent] sendAgentMessage failed', err)
          const msg = err instanceof Error ? err.message : 'Agent send failed'
          pushToast('error', msg)
          throw err
        })
    },
    [tabs, pushToast]
  )

  const runRecipe = useCallback(
    (prompt: string, mode: AgentMode) => {
      setAgentOpen(true)
      setSettingsOpen(false)
      void (async () => {
        try {
          await window.browgent?.setAgentMode?.(mode)
          await window.browgent?.sendAgentMessage?.(
            prompt,
            tabs.find((x) => x.isActive)?.id
          )
        } catch (err) {
          console.error('[browgent] recipe send failed', err)
          const msg = err instanceof Error ? err.message : 'Recipe send failed'
          pushToast('error', msg)
        }
      })()
    },
    [tabs, pushToast]
  )

  const onSummarizePage = useCallback(() => {
    const active = tabs.find((t) => t.isActive)
    if (!active?.url || isBlankUrl(active.url)) {
      pushToast('info', 'Open a page to summarize')
      return
    }
    void import('@shared/summary').then(({ SUMMARIZE_PAGE_PROMPT }) => {
      runRecipe(SUMMARIZE_PAGE_PROMPT, 'research')
    })
  }, [tabs, runRecipe, pushToast])

  // Avoid first-run modal flash before zustand rehydrates localStorage
  useEffect(() => {
    if (useChromePrefs.persist.hasHydrated()) {
      setPrefsHydrated(true)
      return
    }
    return useChromePrefs.persist.onFinishHydration(() => setPrefsHydrated(true))
  }, [])

  // Sync renderer telemetry preference → main metrics store (wait for zustand rehydrate
  // so cold start does not overwrite main with the pre-hydrate default false).
  useEffect(() => {
    if (!prefsHydrated || !window.browgent?.setTelemetryOptIn) return
    void window.browgent.setTelemetryOptIn(telemetryOptIn).catch(() => {
      /* ignore */
    })
  }, [prefsHydrated, telemetryOptIn])

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
    pinCurrentAsFavorite,
    onSummarizePage
  })

  const activeTab = useMemo(() => tabs.find((t) => t.isActive), [tabs])
  const agentBusy =
    agent?.status === 'thinking' ||
    agent?.status === 'acting' ||
    agent?.status === 'waiting_human' ||
    agent?.status === 'paused'

  const bookmarkedId = activeTab?.url ? isBookmarkedUrl(activeTab.url) : null
  const favorited = bookmarkedId ? isFavorite(bookmarkedId) : false
  const firstRunOpen = prefsHydrated && !onboardingDismissed
  const chromeOverlay = settingsOpen || historyOpen
  // First-run is a full-window HTML modal — guest view would cover it if a real page is showing
  const guestMustHide = chromeOverlay || firstRunOpen
  const showNewTab = !chromeOverlay && isBlankUrl(activeTab?.url)
  // Guest WebContentsView covers the content hole on real pages — native overlay there.
  // On New Tab / Settings the guest is hidden — React float is reliable.
  const guestCoveringPage = !guestMustHide && !showNewTab
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
      form: agentPetForm,
      ...(agentPetX >= 0 ? { x: agentPetX } : {}),
      ...(agentPetY >= 0 ? { y: agentPetY } : {})
    })
  }, [
    agentPetVisible,
    agentOpen,
    guestCoveringPage,
    theme,
    agent?.status,
    agentPetForm,
    agentPetX,
    agentPetY
  ])

  // Settings / History / First-run sit over a live page — force-hide guest. New Tab uses about:blank.
  useEffect(() => {
    if (!window.browgent?.setGuestVisible) return
    void window.browgent.setGuestVisible(!guestMustHide)
  }, [guestMustHide])

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
          onDownloadsOpenChange={setDownloadsOpen}
          onSummarizePage={onSummarizePage}
        />
        <FindBar
          open={findOpen && !chromeOverlay && !showNewTab}
          tabId={activeTab?.id}
          onClose={() => setFindOpen(false)}
        />
        {/* Toast mounts inside .chrome-top (the chrome band) so it paints above the
            native WebContentsView, which otherwise covers the content hole on live
            pages and would hide a toast rendered at the app-shell root. */}
        <Toast toast={currentToast} onDismiss={dismissToast} />
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
          onToast={pushToast}
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
        onToast={pushToast}
      />

      {showReactPet && (
        <FloatingAgentPet
          theme={theme}
          agentOpen={agentOpen}
          agentStatus={agent?.status}
          onToggle={() => setAgentOpen((v) => !v)}
        />
      )}

      <FirstRunModal
        open={prefsHydrated && !onboardingDismissed}
        onDismiss={() => setOnboardingDismissed(true)}
        onOpenAgent={() => setAgentOpen(true)}
        onPickRecipe={runRecipe}
      />
    </div>
  )
}
