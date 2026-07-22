import { useCallback, useEffect, useState } from 'react'
import type { AgentSessionState, TabState } from '@shared/types'
import type { CdpEndpointStatus, DriverMode } from '../../../shared/driver'

interface Props {
  activeTab: TabState | undefined
  agent: AgentSessionState | null
  tabCount: number
}

export function StatusBar({ activeTab, agent, tabCount }: Props): React.JSX.Element {
  const host = safeHost(activeTab?.url)
  const live = agent?.status && agent.status !== 'idle'
  const [driver, setDriver] = useState<CdpEndpointStatus | null>(null)

  const refreshDriver = useCallback(() => {
    if (!window.browgent?.getDriverStatus) return
    void window.browgent.getDriverStatus().then(setDriver)
  }, [])

  useEffect(() => {
    refreshDriver()
    const t = window.setInterval(refreshDriver, 5000)
    return () => window.clearInterval(t)
  }, [refreshDriver])

  const cycleDriver = useCallback(() => {
    if (!window.browgent?.setDriverMode) return
    const next: DriverMode = driver?.driverMode === 'cdp' ? 'dom' : 'cdp'
    void window.browgent.setDriverMode(next).then(() => refreshDriver())
  }, [driver?.driverMode, refreshDriver])

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
      <span className={agent?.provider && agent.provider !== 'heuristic' ? 'live' : undefined}>
        brain{' '}
        <strong>
          {agent?.provider && agent.provider !== 'heuristic'
            ? agent.model || agent.provider
            : 'heuristic'}
        </strong>
      </span>
      <span className="statusbar-sep" />
      <span>
        mode <strong>{agent?.mode ?? 'act'}</strong>
      </span>
      {driver && (
        <>
          <span className="statusbar-sep" />
          <button
            type="button"
            className="statusbar-btn"
            title={
              driver.enabled
                ? `${driver.note}\nClick to toggle in-app driver (dom ↔ cdp)`
                : 'CDP off — set BROWGENT_CDP_PORT=9222 and restart'
            }
            onClick={cycleDriver}
          >
            drive <strong>{driver.driverMode}</strong>
            {driver.enabled ? (
              <span className="live"> · cdp:{driver.port}</span>
            ) : (
              <span> · cdp:off</span>
            )}
          </button>
        </>
      )}
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
