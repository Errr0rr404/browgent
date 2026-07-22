import { useCallback, useEffect, useState } from 'react'
import type { AgentSessionState, TabState } from '@shared/types'
import type { CdpEndpointStatus, DriverMode } from '@shared/driver'

interface Props {
  activeTab: TabState | undefined
  agent: AgentSessionState | null
  tabCount: number
}

const APP_VERSION_FALLBACK = 'dev'
const APP_VERSION_LOADING = '…'

export function StatusBar({ activeTab, agent, tabCount }: Props): React.JSX.Element {
  const host = safeHost(activeTab?.url)
  const live = agent?.status && agent.status !== 'idle'
  const [driver, setDriver] = useState<CdpEndpointStatus | null>(null)
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION_LOADING)

  const refreshDriver = useCallback(() => {
    if (!window.browgent?.getDriverStatus) return
    window.browgent.getDriverStatus().then(setDriver).catch(() => {
      /* ignore */
    })
  }, [])

  useEffect(() => {
    refreshDriver()
    const t = window.setInterval(refreshDriver, 5000)
    return () => window.clearInterval(t)
  }, [refreshDriver])

  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      try {
        const v = await window.browgent.appVersion()
        if (alive && typeof v === 'string' && v.length > 0) setAppVersion(v)
      } catch {
        if (alive) setAppVersion(APP_VERSION_FALLBACK)
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [])

  const cycleDriver = useCallback(() => {
    if (!window.browgent?.setDriverMode) return
    const next: DriverMode = driver?.driverMode === 'cdp' ? 'dom' : 'cdp'
    window.browgent
      .setDriverMode(next)
      .then(() => refreshDriver())
      .catch(() => {
        /* ignore */
      })
  }, [driver?.driverMode, refreshDriver])

  return (
    <footer className="statusbar" aria-label="Browser status">
      <span aria-label={`${tabCount} open tabs`}>
        tabs <strong>{tabCount}</strong>
      </span>
      <span className="statusbar-sep" />
      <span
        className={live ? 'live' : undefined}
        aria-live="polite"
        aria-label={`Agent status: ${agent?.status ?? 'idle'}`}
      >
        agent <strong>{agent?.status ?? 'idle'}</strong>
      </span>
      <span className="statusbar-sep" />
      <span
        className={agent?.provider && agent.provider !== 'heuristic' ? 'live' : undefined}
        aria-label={`Brain provider: ${agent?.provider ?? 'heuristic'}`}
      >
        brain{' '}
        <strong>
          {agent?.provider && agent.provider !== 'heuristic'
            ? agent.model || agent.provider
            : 'heuristic'}
        </strong>
      </span>
      <span className="statusbar-sep" />
      <span aria-label={`Agent mode: ${agent?.mode ?? 'act'}`}>
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
            aria-label={`Driver ${driver.driverMode}, ${driver.enabled ? `CDP on port ${driver.port}` : 'CDP off'}. Click to toggle.`}
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
          <span
            className={activeTab.owner === 'agent' ? 'live' : undefined}
            aria-label={`Active tab owner: ${activeTab.owner}`}
          >
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
            aria-label={`Active host: ${host}`}
          >
            {host}
          </span>
        </>
      )}
      {!host && <span style={{ flex: 1 }} aria-hidden />}
      <span aria-label={`Browgent version ${appVersion}`}>
        browgent {appVersion}
      </span>
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
