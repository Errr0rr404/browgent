import { useMemo, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import type { TabState } from '@shared/types'
import { useRovingTablist } from '../hooks/useRovingTablist'
import { Favicon } from './Favicon'

interface Props {
  tabs: TabState[]
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TabBar({ tabs, onActivate, onClose, onNew }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
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

  return (
    <div className="tabbar" role="tablist" aria-label="Browser tabs" ref={containerRef}>
      <div className="tabs-scroll">
        {tabs.map((tab, i) => {
          const tp = r.tabPropsFor(tab, i)
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.isActive}
              className={`tab${tab.isActive ? ' active' : ''}`}
              tabIndex={tp.tabIndex}
              onFocus={tp.onFocus}
              onKeyDown={tp.onKeyDown}
              onClick={tp.onClick}
              onAuxClick={(e) => {
                // Middle-click closes tab (browser standard)
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(tab.id)
                }
              }}
              title={tab.url}
            >
              <Favicon src={tab.favicon} title={tab.title} size={11} className="tab-favicon" />
              <span className="tab-title">{tab.title || 'New Tab'}</span>
              {tab.owner === 'agent' && <span className="tab-owner">agent</span>}
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tab.title || 'tab'}`}
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
  )
}
