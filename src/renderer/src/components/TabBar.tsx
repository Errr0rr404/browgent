import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { TabState } from '@shared/types'
import { isBlankUrl, tabDisplayTitle } from '../lib/urls'
import { copyText } from '../lib/clipboard'
import { useRovingTablist } from '../hooks/useRovingTablist'
import { BrandMark } from './BrandMark'
import { Favicon } from './Favicon'

function tabLabel(tab: TabState): string {
  return tabDisplayTitle(tab.title, tab.url)
}

interface Props {
  tabs: TabState[]
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onToast?: (kind: 'success' | 'info' | 'error', text: string) => void
}

interface TabMenuState {
  tabId: string
}

export function TabBar({ tabs, onActivate, onClose, onNew, onToast }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<TabMenuState | null>(null)
  const activeIdx = useMemo(
    () => Math.max(0, tabs.findIndex((t) => t.isActive)),
    [tabs]
  )

  const r = useRovingTablist({
    items: tabs,
    activeIndex: activeIdx,
    orientation: 'horizontal',
    containerRef,
    onActivate: (tab) => onActivate(tab.id),
    onClose: (tab) => onClose(tab.id)
  })

  useEffect(() => {
    if (!menu) return
    window.dispatchEvent(new Event('resize'))
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.dispatchEvent(new Event('resize'))
    }
  }, [menu])

  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : undefined

  return (
    <>
    <div className="tabbar" role="tablist" aria-label="Browser tabs" ref={containerRef}>
      {/* Brand sits on the first chrome row (with traffic lights) so hiding the
          library doesn’t leave a blank strip above the toolbar. */}
      <div className="toolbar-brand tabbar-brand" aria-label="browgent">
        <BrandMark size={16} className="brand-mark-svg" strokeWidth={2} />
        <span className="brand-name">browgent</span>
      </div>
      <div className="tabs-scroll">
        {tabs.map((tab, i) => {
          const tp = r.tabPropsFor(tab, i)
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.isActive}
              className={`tab${tab.isActive ? ' active' : ''}${tab.loadError ? ' has-error' : ''}`}
              tabIndex={tp.tabIndex}
              onFocus={tp.onFocus}
              onKeyDown={tp.onKeyDown}
              onClick={tp.onClick}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ tabId: tab.id })
              }}
              onAuxClick={(e) => {
                // Middle-click closes tab (browser standard)
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(tab.id)
                }
              }}
              title={
                tab.loadError
                  ? `${tab.loadError} — ${isBlankUrl(tab.url) ? 'New Tab' : tab.url}`
                  : isBlankUrl(tab.url)
                    ? 'New Tab'
                    : tab.url
              }
            >
              <Favicon
                src={isBlankUrl(tab.url) ? undefined : tab.favicon}
                title={tabLabel(tab)}
                size={14}
                className="tab-favicon"
              />
              <span className="tab-title">{tabLabel(tab)}</span>
              {tab.owner === 'agent' && <span className="tab-owner">agent</span>}
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tabLabel(tab)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                tabIndex={-1}
              >
                <X size={12} strokeWidth={2} />
              </button>
              {tab.isLoading && <span className="tab-loading" aria-hidden />}
            </div>
          )
        })}
      </div>
      <button type="button" className="new-tab-btn" aria-label="New tab" onClick={onNew}>
        <Plus size={16} strokeWidth={1.75} />
      </button>
    </div>
      {menu && menuTab && (
        <div className="tab-context-flyout" ref={menuRef}>
        <div
          className="arc-menu tab-context-menu"
          role="menu"
          aria-label="Tab actions"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onNew()
              setMenu(null)
            }}
          >
            New Tab
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void window.browgent.duplicateTab?.(menuTab.id)
              setMenu(null)
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isBlankUrl(menuTab.url)}
            onClick={() => {
              void window.browgent.reload(menuTab.id)
              setMenu(null)
            }}
          >
            Reload
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isBlankUrl(menuTab.url)}
            onClick={() => {
              void copyText(menuTab.url).then((ok) => {
                onToast?.(ok ? 'success' : 'error', ok ? 'URL copied' : 'Could not copy URL')
              })
              setMenu(null)
            }}
          >
            Copy URL
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              onClose(menuTab.id)
              setMenu(null)
            }}
          >
            Close
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={tabs.length < 2}
            onClick={() => {
              void window.browgent.closeOtherTabs?.(menuTab.id)
              setMenu(null)
            }}
          >
            Close Others
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void window.browgent.closeTabsToTheRight?.(menuTab.id)
              setMenu(null)
            }}
          >
            Close Tabs to the Right
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void window.browgent.reopenClosedTab?.()
              setMenu(null)
            }}
          >
            Reopen Closed Tab
          </button>
        </div>
        </div>
      )}
    </>
  )
}
