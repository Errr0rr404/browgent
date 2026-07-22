import { Globe, Plus, X } from 'lucide-react'
import type { TabState } from '@shared/types'

interface Props {
  tabs: TabState[]
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TabBar({ tabs, onActivate, onClose, onNew }: Props): React.JSX.Element {
  return (
    <div className="tabbar" role="tablist" aria-label="Browser tabs">
      <div className="tabs-scroll">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.isActive}
            className={`tab${tab.isActive ? ' active' : ''}`}
            onClick={() => onActivate(tab.id)}
            onAuxClick={(e) => {
              // Middle-click closes tab (browser standard)
              if (e.button === 1) {
                e.preventDefault()
                onClose(tab.id)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActivate(tab.id)
              }
            }}
            tabIndex={0}
            title={tab.url}
          >
            {tab.favicon ? (
              <img
                className="tab-favicon"
                src={tab.favicon}
                alt=""
                draggable={false}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <span className="tab-favicon placeholder" aria-hidden>
                <Globe size={11} strokeWidth={1.75} />
              </span>
            )}
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
            >
              <X size={12} strokeWidth={2} />
            </button>
            {tab.isLoading && <span className="tab-loading" aria-hidden />}
          </div>
        ))}
      </div>
      <button type="button" className="new-tab-btn" aria-label="New tab" onClick={onNew}>
        <Plus size={16} strokeWidth={1.75} />
      </button>
    </div>
  )
}
