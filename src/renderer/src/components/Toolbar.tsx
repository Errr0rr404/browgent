import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Lock,
  PanelLeft,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Star,
  X
} from 'lucide-react'
import type { TabState } from '@shared/types'
import type { ThemeId } from '../themes/themes'
import { isBlankUrl, omniboxDisplayUrl } from '../lib/urls'
import { resolveOmniboxInput, useChromePrefs } from '../stores/chromePrefs'
import { BrandMark } from './BrandMark'
import { ThemePicker } from './ThemePicker'

interface Props {
  activeTab: TabState | undefined
  agentOpen: boolean
  agentBusy: boolean
  sidebarOpen: boolean
  settingsOpen: boolean
  /** Guest WebContentsView is not covering the content hole (settings / new tab). */
  themeOverlaySafe?: boolean
  isBookmarked: boolean
  isFavorited: boolean
  theme: ThemeId
  onThemeChange: (id: ThemeId) => void
  onToggleAgent: () => void
  onToggleSidebar: () => void
  onToggleBookmark: () => void
  onOpenSettings: () => void
}

export function Toolbar({
  activeTab,
  agentOpen,
  agentBusy,
  sidebarOpen,
  settingsOpen,
  themeOverlaySafe = true,
  isBookmarked,
  isFavorited,
  theme,
  onThemeChange,
  onToggleAgent,
  onToggleSidebar,
  onToggleBookmark,
  onOpenSettings
}: Props): React.JSX.Element {
  const searchEngine = useChromePrefs((s) => s.searchEngine)
  const display = omniboxDisplayUrl(activeTab?.url, { settingsOpen })
  const [value, setValue] = useState(display)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setValue(omniboxDisplayUrl(activeTab?.url, { settingsOpen }))
    }
  }, [activeTab?.id, activeTab?.url, focused, settingsOpen])

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
    // Match New Tab: multi-word / no-dot → preferred search engine
    const target = resolveOmniboxInput(input, searchEngine)
    if (!activeTab?.id) {
      void window.browgent.createTab(target)
    } else {
      void window.browgent.navigate({ tabId: activeTab.id, input: target })
    }
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }

  const isSecure = display.startsWith('https://')
  const isLoading = !settingsOpen && (activeTab?.isLoading ?? false)
  const canBookmark =
    !settingsOpen &&
    Boolean(activeTab?.url) &&
    !isBlankUrl(activeTab?.url) &&
    !activeTab!.url.startsWith('data:')

  return (
    <div className="toolbar">
      <div className="toolbar-brand" aria-label="browgent">
        <BrandMark size={16} className="brand-mark-svg" strokeWidth={2} />
        <span className="brand-name">browgent</span>
      </div>
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
          disabled={settingsOpen || !activeTab?.canGoBack}
          onClick={() => void window.browgent.goBack(activeTab?.id)}
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Forward"
          disabled={settingsOpen || !activeTab?.canGoForward}
          onClick={() => void window.browgent.goForward(activeTab?.id)}
        >
          <ArrowRight size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={isLoading ? 'Stop' : 'Reload'}
          disabled={settingsOpen || isBlankUrl(activeTab?.url)}
          onClick={() =>
            isLoading
              ? void window.browgent.stop(activeTab?.id)
              : void window.browgent.reload(activeTab?.id)
          }
        >
          {isLoading ? (
            <X size={16} strokeWidth={1.75} />
          ) : (
            <RefreshCw size={15} strokeWidth={1.75} />
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
          onClick={onOpenSettings}
        >
          <Settings2 size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={`agent-toggle${agentOpen ? ' open' : ''}${agentBusy ? ' busy' : ''}`}
          onClick={onToggleAgent}
          aria-pressed={agentOpen}
          aria-label="Toggle agent panel"
          title="Toggle agent panel (⌘J)"
        >
          <span className="agent-dot" aria-hidden />
          <Bot size={14} strokeWidth={1.75} />
          Agent
        </button>
      </div>
    </div>
  )
}
