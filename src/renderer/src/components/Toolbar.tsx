import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Clock,
  Lock,
  PanelLeft,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Star,
  X
} from 'lucide-react'
import type { TabState } from '@shared/types'
import type { ThemeId } from '../themes/themes'
import { isBlankUrl, omniboxDisplayUrl } from '../lib/urls'
import { resolveOmniboxInput, useChromePrefs } from '../stores/chromePrefs'
import { BrandMark } from './BrandMark'
import { DownloadsPanel } from './DownloadsPanel'
import { ThemePicker } from './ThemePicker'

interface Props {
  activeTab: TabState | undefined
  agentOpen: boolean
  agentBusy: boolean
  sidebarOpen: boolean
  settingsOpen: boolean
  historyOpen?: boolean
  downloadsOpen?: boolean
  downloadActiveCount?: number
  /** Guest WebContentsView is not covering the content hole (settings / new tab). */
  themeOverlaySafe?: boolean
  /** When true, themed pet handles agent entry — hide toolbar Agent button. */
  agentPetVisible?: boolean
  isBookmarked: boolean
  isFavorited: boolean
  theme: ThemeId
  onThemeChange: (id: ThemeId) => void
  onToggleAgent: () => void
  onToggleSidebar: () => void
  onToggleBookmark: () => void
  /** Always open settings (e.g. theme gallery). */
  onOpenSettings: () => void
  /** Toolbar gear: open if closed, close if open. */
  onToggleSettings: () => void
  onToggleHistory?: () => void
  onOpenHistory?: () => void
  onToggleDownloads?: () => void
  onOpenDownloads?: () => void
  onDownloadsOpenChange?: (open: boolean) => void
  /** One-click research-mode summary of the active page */
  onSummarizePage?: () => void
}

export function Toolbar({
  activeTab,
  agentOpen,
  agentBusy,
  sidebarOpen,
  settingsOpen,
  historyOpen = false,
  downloadsOpen = false,
  downloadActiveCount = 0,
  themeOverlaySafe = true,
  agentPetVisible = true,
  isBookmarked,
  isFavorited,
  theme,
  onThemeChange,
  onToggleAgent,
  onToggleSidebar,
  onToggleBookmark,
  onOpenSettings,
  onToggleSettings,
  onToggleHistory,
  onOpenHistory,
  onToggleDownloads,
  onOpenDownloads,
  onDownloadsOpenChange,
  onSummarizePage
}: Props): React.JSX.Element {
  const searchEngine = useChromePrefs((s) => s.searchEngine)
  const setAgentPetVisible = useChromePrefs((s) => s.setAgentPetVisible)
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const agentBtnWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!agentMenuOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (agentBtnWrapRef.current?.contains(e.target as Node)) return
      setAgentMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAgentMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [agentMenuOpen])
  const chromeOverlay = settingsOpen || historyOpen
  const display = omniboxDisplayUrl(activeTab?.url, { settingsOpen, historyOpen })
  const [value, setValue] = useState(display)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setValue(omniboxDisplayUrl(activeTab?.url, { settingsOpen, historyOpen }))
    }
  }, [activeTab?.id, activeTab?.url, focused, settingsOpen, historyOpen])

  const submit = (): void => {
    const input = value.trim()
    if (!input) return
    if (
      input === 'browgent://settings' ||
      input === 'settings' ||
      input === 'about:settings'
    ) {
      onOpenSettings()
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      return
    }
    if (
      input === 'browgent://history' ||
      input === 'history' ||
      input === 'about:history'
    ) {
      ;(onOpenHistory ?? onToggleHistory)?.()
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      return
    }
    if (
      input === 'browgent://downloads' ||
      input === 'downloads' ||
      input === 'about:downloads'
    ) {
      ;(onOpenDownloads ?? onToggleDownloads)?.()
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      return
    }
    // Match New Tab: multi-word / no-dot → preferred search engine
    const target = resolveOmniboxInput(input, searchEngine)
    // Close chrome overlays so the user sees the navigated guest page
    if (historyOpen) {
      // history is controlled in App; toggle closed if open
      if (onToggleHistory && historyOpen) onToggleHistory()
    }
    if (settingsOpen) onToggleSettings()
    if (!activeTab?.id) {
      void window.browgent.createTab(target)
    } else {
      void window.browgent.navigate({ tabId: activeTab.id, input: target })
    }
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }

  const isSecure = display.startsWith('https://')
  const isLoading = !chromeOverlay && (activeTab?.isLoading ?? false)
  const canBookmark =
    !chromeOverlay &&
    Boolean(activeTab?.url) &&
    !isBlankUrl(activeTab?.url) &&
    !activeTab!.url.startsWith('data:')

  return (
    <div className="toolbar">
      {/* Brand only when sidebar is open (toolbar is the first chrome row).
          When sidebar is closed, brand lives on the tab bar with traffic lights. */}
      {sidebarOpen && (
        <div className="toolbar-brand" aria-label="browgent">
          <BrandMark size={16} className="brand-mark-svg" strokeWidth={2} />
          <span className="brand-name">browgent</span>
        </div>
      )}
      <div className="nav-group">
        {!sidebarOpen && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Show sidebar"
            title="Show sidebar (⌘⇧S)"
            onClick={onToggleSidebar}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          disabled={chromeOverlay || !activeTab?.canGoBack}
          onClick={() => void window.browgent.goBack(activeTab?.id)}
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Forward"
          disabled={chromeOverlay || !activeTab?.canGoForward}
          onClick={() => void window.browgent.goForward(activeTab?.id)}
        >
          <ArrowRight size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={isLoading ? 'Stop' : 'Reload'}
          disabled={chromeOverlay || isBlankUrl(activeTab?.url)}
          onClick={() =>
            isLoading
              ? void window.browgent.stop(activeTab?.id)
              : void window.browgent.reload(activeTab?.id)
          }
        >
          {isLoading ? (
            <X size={16} strokeWidth={1.75} />
          ) : (
            <RefreshCw size={16} strokeWidth={1.75} />
          )}
        </button>
      </div>

      <form
        className={`omnibox-wrap${isSecure ? ' secure' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <span className="omnibox-icon" aria-hidden>
          {isSecure ? (
            <Lock size={13} strokeWidth={1.75} />
          ) : display.startsWith('http://') ? (
            <ShieldAlert size={13} strokeWidth={1.75} />
          ) : (
            <Search size={13} strokeWidth={1.75} />
          )}
        </span>
        <input
          className="omnibox"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => {
            setFocused(true)
            e.currentTarget.select()
          }}
          onBlur={() => setFocused(false)}
          placeholder="Search or enter address"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Address bar"
        />
        <button
          type="button"
          className={`bookmark-star${isFavorited ? ' on' : ''}`}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          title={
            isFavorited
              ? 'In favorites (⌘D)'
              : isBookmarked
                ? 'Bookmarked — pin to favorites (⌘D)'
                : 'Add to favorites (⌘D)'
          }
          disabled={!canBookmark}
          onClick={onToggleBookmark}
        >
          <Star
            size={14}
            strokeWidth={1.75}
            fill={isFavorited ? 'currentColor' : 'none'}
          />
        </button>
      </form>

      <div className="toolbar-actions">
        {onSummarizePage && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Summarize page"
            title="Summarize page (⌘⇧U)"
            disabled={!activeTab?.url || isBlankUrl(activeTab.url)}
            onClick={onSummarizePage}
          >
            <Sparkles size={16} strokeWidth={1.75} />
          </button>
        )}
        {onToggleHistory && (
          <button
            type="button"
            className={`icon-btn${historyOpen ? ' active' : ''}`}
            aria-label="History"
            title="History (⌘Y)"
            aria-pressed={historyOpen}
            onClick={onToggleHistory}
          >
            <Clock size={16} strokeWidth={1.75} />
          </button>
        )}
        {(onToggleDownloads || onDownloadsOpenChange) && (
          <DownloadsPanel
            open={downloadsOpen}
            onOpenChange={(next) => {
              if (onDownloadsOpenChange) {
                onDownloadsOpenChange(next)
                return
              }
              if (next) onOpenDownloads?.()
              else if (downloadsOpen) onToggleDownloads?.()
            }}
            overlaySafe={themeOverlaySafe}
            activeCount={downloadActiveCount}
          />
        )}
        <ThemePicker
          theme={theme}
          onChange={onThemeChange}
          onOpenGallery={onOpenSettings}
          overlaySafe={themeOverlaySafe}
        />
        <button
          type="button"
          className={`icon-btn${settingsOpen ? ' active' : ''}`}
          aria-label="Settings"
          title="Settings (⌘,)"
          aria-pressed={settingsOpen}
          onClick={onToggleSettings}
        >
          <Settings2 size={16} strokeWidth={1.75} />
        </button>
        {!agentPetVisible && (
          <div className="agent-toggle-wrap" ref={agentBtnWrapRef}>
            <button
              type="button"
              className={`agent-toggle${agentOpen ? ' open' : ''}${agentBusy ? ' busy' : ''}`}
              onClick={() => {
                setAgentMenuOpen(false)
                onToggleAgent()
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                // Absolute menu is clipped by guest WebContentsView over the content hole.
                if (!themeOverlaySafe) {
                  setAgentPetVisible(true)
                  return
                }
                setAgentMenuOpen(true)
              }}
              aria-pressed={agentOpen}
              aria-label="Toggle agent panel"
              title="Toggle agent panel (⌘J) · right-click to show companion"
            >
              <span className="agent-dot" aria-hidden />
              <Bot size={16} strokeWidth={1.75} />
              Agent
            </button>
            {agentMenuOpen && (
              <ul className="agent-toggle-menu" role="menu">
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAgentPetVisible(true)
                      setAgentMenuOpen(false)
                    }}
                  >
                    Show companion
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
