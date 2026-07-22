import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Lock,
  PanelLeft,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  X
} from 'lucide-react'
import type { TabState } from '@shared/types'
import type { ThemeId } from '../themes/themes'
import { ThemePicker } from './ThemePicker'

interface Props {
  activeTab: TabState | undefined
  agentOpen: boolean
  agentBusy: boolean
  sidebarOpen: boolean
  isBookmarked: boolean
  isFavorited: boolean
  theme: ThemeId
  onThemeChange: (id: ThemeId) => void
  onToggleAgent: () => void
  onToggleSidebar: () => void
  onToggleBookmark: () => void
}

export function Toolbar({
  activeTab,
  agentOpen,
  agentBusy,
  sidebarOpen,
  isBookmarked,
  isFavorited,
  theme,
  onThemeChange,
  onToggleAgent,
  onToggleSidebar,
  onToggleBookmark
}: Props): React.JSX.Element {
  const [value, setValue] = useState(activeTab?.url ?? '')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setValue(activeTab?.url ?? '')
    }
  }, [activeTab?.id, activeTab?.url, focused])

  const submit = (): void => {
    const input = value.trim()
    if (!input) return
    // If no active tab yet, create one with this URL
    if (!activeTab?.id) {
      void window.browgent.createTab(input)
    } else {
      void window.browgent.navigate({ tabId: activeTab.id, input })
    }
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }

  const isSecure = (activeTab?.url ?? '').startsWith('https://')
  const isLoading = activeTab?.isLoading ?? false
  const canBookmark =
    Boolean(activeTab?.url) &&
    activeTab!.url !== 'about:blank' &&
    !activeTab!.url.startsWith('data:')

  return (
    <div className="toolbar">
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
          disabled={!activeTab?.canGoBack}
          onClick={() => void window.browgent.goBack(activeTab?.id)}
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Forward"
          disabled={!activeTab?.canGoForward}
          onClick={() => void window.browgent.goForward(activeTab?.id)}
        >
          <ArrowRight size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={isLoading ? 'Stop' : 'Reload'}
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
          ) : activeTab?.url.startsWith('http://') ? (
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
        <ThemePicker theme={theme} onChange={onThemeChange} />
        <button
          type="button"
          className={`agent-toggle${agentOpen ? ' open' : ''}${agentBusy ? ' busy' : ''}`}
          onClick={onToggleAgent}
          aria-pressed={agentOpen}
          aria-label="Toggle agent panel"
        >
          <span className="agent-dot" aria-hidden />
          <Bot size={14} strokeWidth={1.75} />
          Agent
        </button>
      </div>
    </div>
  )
}
