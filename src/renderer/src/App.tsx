import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSessionState, TabState } from '@shared/types'
import { TitleBar } from './components/TitleBar'
import { TabBar } from './components/TabBar'
import { Toolbar } from './components/Toolbar'
import { AgentPanel } from './components/AgentPanel'
import { StatusBar } from './components/StatusBar'
import { Sidebar } from './components/Sidebar'
import { useChromeMetrics } from './hooks/useChromeMetrics'
import { useTheme } from './hooks/useTheme'
import { useBookmarks } from './stores/bookmarks'
import './styles/app.css'

export default function App(): React.JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>([])
  const [agentOpen, setAgentOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [agent, setAgent] = useState<AgentSessionState | null>(null)
  const { theme, setTheme } = useTheme()
  const platformRaw = window.browgent?.platform ?? 'darwin'
  /** CSS class token: win32 → win (matches app.css .platform-win) */
  const platform =
    platformRaw === 'win32' ? 'win' : platformRaw === 'darwin' ? 'darwin' : 'linux'
  const contentRef = useRef<HTMLDivElement>(null)
  const creatingRef = useRef(false)
  const pinCurrentAsFavorite = useBookmarks((s) => s.pinCurrentAsFavorite)
  const isBookmarkedUrl = useBookmarks((s) => s.isBookmarkedUrl)
  const toggleFavorite = useBookmarks((s) => s.toggleFavorite)
  const isFavorite = useBookmarks((s) => s.isFavorite)

  useChromeMetrics(contentRef, agentOpen, `${sidebarOpen}:${agentOpen}`)

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
    } finally {
      window.setTimeout(() => {
        creatingRef.current = false
      }, 200)
    }
  }, [])

  const openUrl = useCallback(
    (url: string, newTab = false) => {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      // Escape: blur address bar / stop agent when not typing in agent composer
      if (e.key === 'Escape') {
        if (target?.classList.contains('omnibox')) {
          e.preventDefault()
          target.blur()
          return
        }
        if (
          !typing &&
          (agent?.status === 'thinking' ||
            agent?.status === 'acting' ||
            agent?.status === 'paused' ||
            agent?.status === 'waiting_human')
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
      if (e.key === 'd' && !e.shiftKey) {
        // Arc / browser classic: pin current page to favorites
        e.preventDefault()
        const active = tabs.find((t) => t.isActive)
        if (!active?.url || active.url === 'about:blank') return
        const existing = isBookmarkedUrl(active.url)
        if (existing) toggleFavorite(existing)
        else pinCurrentAsFavorite(active.title, active.url, active.favicon)
      }
      if (e.key === 'r' && !e.shiftKey) {
        e.preventDefault()
        const active = tabs.find((t) => t.isActive)
        void window.browgent.reload(active?.id)
      }
      // ⌘1–⌘9 switch tabs (⌘9 = last tab)
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = e.key === '9' ? tabs.length - 1 : Number(e.key) - 1
        const tab = tabs[idx]
        if (tab) void window.browgent.activateTab(tab.id)
      }
      // ⌘[ / ⌘] history navigation (skip when editing text — preserve line navigation)
      if (!typing && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const active = tabs.find((t) => t.isActive)
        if (e.key === '[') void window.browgent.goBack(active?.id)
        else void window.browgent.goForward(active?.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, createTabOnce, isBookmarkedUrl, toggleFavorite, pinCurrentAsFavorite, agent?.status])

  const activeTab = useMemo(() => tabs.find((t) => t.isActive), [tabs])
  const agentBusy =
    agent?.status === 'thinking' ||
    agent?.status === 'acting' ||
    agent?.status === 'waiting_human' ||
    agent?.status === 'paused'

  const bookmarkedId = activeTab?.url ? isBookmarkedUrl(activeTab.url) : null
  const favorited = bookmarkedId ? isFavorite(bookmarkedId) : false

  const onToggleBookmark = useCallback(() => {
    if (!activeTab?.url || activeTab.url === 'about:blank') return
    // Star = Arc favorites pin
    if (bookmarkedId) {
      toggleFavorite(bookmarkedId)
      return
    }
    pinCurrentAsFavorite(activeTab.title, activeTab.url, activeTab.favicon)
  }, [activeTab, bookmarkedId, pinCurrentAsFavorite, toggleFavorite])

  return (
    <div
      className={`app-shell platform-${platform}`}
    >
      <div className="ambient" aria-hidden />
      <div className="chrome-top">
        <TitleBar platform={platform} />
        {/* When Arc sidebar is open, tabs live there — hide the horizontal strip */}
        {!sidebarOpen && (
          <TabBar
            tabs={tabs}
            onActivate={(id) => void window.browgent.activateTab(id)}
            onClose={(id) => void window.browgent.closeTab(id)}
            onNew={() => void createTabOnce()}
          />
        )}
        <Toolbar
          activeTab={activeTab}
          agentOpen={agentOpen}
          agentBusy={agentBusy}
          sidebarOpen={sidebarOpen}
          isBookmarked={Boolean(bookmarkedId)}
          isFavorited={favorited}
          theme={theme}
          onThemeChange={setTheme}
          onToggleAgent={() => setAgentOpen((v) => !v)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleBookmark={onToggleBookmark}
        />
      </div>

      <div className="body">
        <Sidebar
          tabs={tabs}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewTab={() => void createTabOnce()}
          onActivateTab={(id) => void window.browgent.activateTab(id)}
          onCloseTab={(id) => void window.browgent.closeTab(id)}
          onOpenUrl={openUrl}
        />
        <div className="content-hole" ref={contentRef} aria-hidden>
          <div className="content-placeholder">
            <div className="content-placeholder-orb" />
            <p>Loading page…</p>
          </div>
        </div>
        <AgentPanel open={agentOpen} state={agent} onClose={() => setAgentOpen(false)} />
      </div>

      <StatusBar activeTab={activeTab} agent={agent} tabCount={tabs.length} />
    </div>
  )
}
