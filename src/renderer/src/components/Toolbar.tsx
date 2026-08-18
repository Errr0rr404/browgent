import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Clock,
  Copy,
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
import { copyText } from '../lib/clipboard'
import {
  buildSearchUrl,
  looksLikeNavigableUrl,
  resolveOmniboxInput,
  useChromePrefs
} from '../stores/chromePrefs'
import { platformModKey } from '../lib/platform'
import { BrandMark } from './BrandMark'
import { DownloadsPanel } from './DownloadsPanel'
import {
  historyToSuggest,
  OmniboxSuggest,
  type OmniboxSuggestItem
} from './OmniboxSuggest'
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
  onToast?: (kind: 'success' | 'info' | 'error', text: string) => void
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
  onSummarizePage,
  onToast
}: Props): React.JSX.Element {
  const searchEngine = useChromePrefs((s) => s.searchEngine)
  const mod = platformModKey()
  const chord = (keys: string): string => (mod === '⌘' ? `⌘${keys}` : `Ctrl+${keys}`)
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
  const [suggestItems, setSuggestItems] = useState<OmniboxSuggestItem[]>([])
  const [suggestIndex, setSuggestIndex] = useState(-1)
  const [suggestForced, setSuggestForced] = useState(false)
  const suggestSeq = useRef(0)

  useEffect(() => {
    if (!focused) {
      setValue(omniboxDisplayUrl(activeTab?.url, { settingsOpen, historyOpen }))
      setSuggestItems([])
      setSuggestIndex(-1)
      setSuggestForced(false)
    }
  }, [activeTab?.id, activeTab?.url, focused, settingsOpen, historyOpen])

  const typedQuery = focused ? value.trim() : ''
  const showSuggest =
    focused &&
    suggestItems.length > 0 &&
    (themeOverlaySafe || typedQuery.length > 0 || suggestForced)

  useEffect(() => {
    if (!focused || !window.browgent?.searchHistory) {
      setSuggestItems([])
      return
    }
    const q = value.trim()
    // On a live guest page, skip the recents dropdown until the user types or
    // arrows down — an empty-focus flyout would jump the WebContentsView.
    if (!themeOverlaySafe && !q && !suggestForced) {
      setSuggestItems([])
      return
    }
    const seq = ++suggestSeq.current
    const timer = window.setTimeout(() => {
      const run = async (): Promise<void> => {
        const rows = q
          ? await window.browgent.searchHistory(q, 8)
          : await window.browgent.getHistory?.(8)
        if (seq !== suggestSeq.current) return
        const history = historyToSuggest(rows ?? [])
        const extras: OmniboxSuggestItem[] = []
        if (q) {
          const looksLikeUrl = looksLikeNavigableUrl(q)
          extras.push({
            id: looksLikeUrl ? 'go-url' : 'search',
            kind: looksLikeUrl ? 'url' : 'search',
            title: looksLikeUrl ? `Go to ${q}` : `Search ${searchEngine} for “${q}”`,
            url: looksLikeUrl
              ? resolveOmniboxInput(q, searchEngine)
              : buildSearchUrl(searchEngine, q)
          })
        }
        const seen = new Set(extras.map((x) => x.url))
        setSuggestItems([
          ...extras,
          ...history.filter((h) => {
            if (seen.has(h.url)) return false
            seen.add(h.url)
            return true
          })
        ])
        setSuggestIndex(-1)
      }
      void run().catch(() => {
        if (seq === suggestSeq.current) setSuggestItems([])
      })
    }, 70)
    return () => window.clearTimeout(timer)
  }, [focused, value, searchEngine, themeOverlaySafe, suggestForced])

  const pickSuggest = (item: OmniboxSuggestItem): void => {
    setValue(item.url)
    setSuggestItems([])
    setSuggestIndex(-1)
    setSuggestForced(false)
    applyNavigation(item.url)
  }

  const applyNavigation = (raw: string): void => {
    const input = raw.trim()
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

  const submit = (): void => {
    const input = value.trim()
    if (!input) return
    if (showSuggest && suggestIndex >= 0 && suggestItems[suggestIndex]) {
      pickSuggest(suggestItems[suggestIndex])
      return
    }
    applyNavigation(input)
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
            title={`Show sidebar (${chord(mod === '⌘' ? '⇧S' : 'Shift+S')})`}
            onClick={onToggleSidebar}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          title={`Back (${chord('[')})`}
          disabled={chromeOverlay || !activeTab?.canGoBack}
          onClick={() => void window.browgent.goBack(activeTab?.id)}
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Forward"
          title={`Forward (${chord(']')})`}
          disabled={chromeOverlay || !activeTab?.canGoForward}
          onClick={() => void window.browgent.goForward(activeTab?.id)}
        >
          <ArrowRight size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={isLoading ? 'Stop' : 'Reload'}
          title={isLoading ? 'Stop' : `Reload (${chord('R')})`}
          disabled={chromeOverlay || (isBlankUrl(activeTab?.url) && !activeTab?.loadError)}
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

      <div className="omnibox-cluster">
      <form
        className={`omnibox-wrap${isSecure ? ' secure' : ''}${activeTab?.loadError ? ' has-error' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <span
          className="omnibox-icon"
          title={
            activeTab?.loadError
              ? activeTab.loadError
              : isSecure
                ? 'Connection is secure'
                : display.startsWith('http://')
                  ? 'Not secure — HTTP'
                  : undefined
          }
        >
          {isSecure && !activeTab?.loadError ? (
            <Lock size={13} strokeWidth={1.75} />
          ) : display.startsWith('http://') || activeTab?.loadError ? (
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
          onBlur={() => {
            window.setTimeout(() => setFocused(false), 120)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              if (!showSuggest && !themeOverlaySafe) setSuggestForced(true)
              if (suggestItems.length === 0) return
              e.preventDefault()
              setSuggestIndex((i) => (i + 1) % suggestItems.length)
              return
            }
            if (e.key === 'ArrowUp') {
              if (suggestItems.length === 0) return
              e.preventDefault()
              setSuggestIndex((i) => (i <= 0 ? suggestItems.length - 1 : i - 1))
              return
            }
            if (e.key === 'Escape' && showSuggest) {
              e.preventDefault()
              e.stopPropagation()
              setSuggestItems([])
              setSuggestIndex(-1)
              setSuggestForced(false)
            }
          }}
          placeholder="Search or enter address"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Address bar"
          aria-autocomplete="list"
          aria-expanded={showSuggest}
        />
        {canBookmark && (
          <button
            type="button"
            className="bookmark-star omnibox-copy"
            aria-label="Copy URL"
            title="Copy URL"
            onClick={() => {
              const url = activeTab?.url
              if (!url) return
              void copyText(url).then((ok) => {
                onToast?.(ok ? 'success' : 'error', ok ? 'URL copied' : 'Could not copy URL')
              })
            }}
          >
            <Copy size={13} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          className={`bookmark-star${isFavorited ? ' on' : ''}`}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          title={
            isFavorited
              ? `In favorites (${chord('D')})`
              : isBookmarked
                ? `Bookmarked — pin to favorites (${chord('D')})`
                : `Add to favorites (${chord('D')})`
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
      <OmniboxSuggest
        open={showSuggest}
        overlaySafe={themeOverlaySafe}
        items={suggestItems}
        activeIndex={suggestIndex}
        onActiveIndexChange={setSuggestIndex}
        onPick={pickSuggest}
      />
      </div>

      <div className="toolbar-actions">
        {onSummarizePage && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Summarize page"
            title={`Summarize page (${chord(mod === '⌘' ? '⇧U' : 'Shift+U')})`}
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
            title={`History (${chord('Y')})`}
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
          title={`Settings (${chord(',')})`}
          aria-pressed={settingsOpen}
          onClick={onToggleSettings}
        >
          <Settings2 size={16} strokeWidth={1.75} />
        </button>
        {(!agentPetVisible || settingsOpen || historyOpen) && (
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
              title={`Toggle agent panel (${chord('J')}) · right-click to show companion`}
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
