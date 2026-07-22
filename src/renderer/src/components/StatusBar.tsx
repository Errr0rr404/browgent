import type { AgentSessionState, TabState } from '@shared/types'

interface Props {
  activeTab: TabState | undefined
  agent: AgentSessionState | null
  tabCount: number
}

export function StatusBar({ activeTab, agent, tabCount }: Props): React.JSX.Element {
  const host = safeHost(activeTab?.url)
  const live = agent?.status && agent.status !== 'idle'

  return (
    <footer className="statusbar" role="status">
      <span>
        tabs <strong>{tabCount}</strong>
      </span>
      <span className="statusbar-sep" />
      <span className={live ? 'live' : undefined}>
        agent <strong>{agent?.status ?? 'idle'}</strong>
      </span>
      <span className="statusbar-sep" />
      <span className={agent?.provider === 'grok' ? 'live' : undefined}>
        brain <strong>{agent?.provider === 'grok' ? agent.model || 'grok' : 'heuristic'}</strong>
      </span>
      <span className="statusbar-sep" />
      <span>
        mode <strong>{agent?.mode ?? 'act'}</strong>
      </span>
      {activeTab?.owner && (
        <>
          <span className="statusbar-sep" />
          <span className={activeTab.owner === 'agent' ? 'live' : undefined}>
            owner <strong>{activeTab.owner}</strong>
          </span>
        </>
      )}
      {host && (
        <>
          <span className="statusbar-sep" />
          <span
            style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={activeTab?.url}
          >
            {host}
          </span>
        </>
      )}
      {!host && <span style={{ flex: 1 }} />}
      <span>browgent 0.2</span>
    </footer>
  )
}

function safeHost(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
