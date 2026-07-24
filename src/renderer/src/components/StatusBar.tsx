import { useCallback, useEffect, useState } from 'react'
import type { AgentSessionState, TabState } from '@shared/types'
import type { CdpEndpointStatus, DriverMode } from '@shared/driver'
import type { McpStatus } from '@shared/mcp'
import { providerLabel } from '../lib/providers'

interface Props {
  activeTab: TabState | undefined
  agent: AgentSessionState | null
  tabCount: number
  /** Override status host label (e.g. browgent://settings) */
  statusLabel?: string
  /** When set, zoom controls are interactive */
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomReset?: () => void
  onToast?: (kind: 'success' | 'info' | 'error', text: string) => void
}

const APP_VERSION_FALLBACK = 'dev'
const APP_VERSION_LOADING = '…'

export function StatusBar({
  activeTab,
  agent,
  tabCount,
  statusLabel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToast
}: Props): React.JSX.Element {
  const host = statusLabel ?? safeHost(activeTab?.url)
  const status = agent?.status ?? 'idle'
  const live = status !== 'idle'
  const mode = agent?.mode ?? 'act'
  const [driver, setDriver] = useState<CdpEndpointStatus | null>(null)
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION_LOADING)
  const zoomFactor = activeTab?.zoomFactor ?? 1
  const zoomPct = Math.round(zoomFactor * 100)

  const refreshDriver = useCallback(() => {
    if (!window.browgent?.getDriverStatus) return
    window.browgent.getDriverStatus().then(setDriver).catch(() => {
      /* ignore */
    })
  }, [])

  const refreshMcp = useCallback(() => {
    if (!window.browgent?.getMcpStatus) return
    window.browgent.getMcpStatus().then(setMcp).catch(() => {
      /* ignore */
    })
  }, [])

  useEffect(() => {
    refreshDriver()
    refreshMcp()
    // CDP probe is cached in main; still no need to hammer IPC
    const t = window.setInterval(() => {
      refreshDriver()
      refreshMcp()
    }, 15_000)
    return () => window.clearInterval(t)
  }, [refreshDriver, refreshMcp])

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

  const copyMcp = useCallback(() => {
    if (!mcp?.enabled || !mcp.baseUrl) {
      onToast?.('info', 'MCP bridge is off (BROWGENT_MCP=0)')
      return
    }
    void navigator.clipboard.writeText(mcp.baseUrl).then(
      () => onToast?.('success', `Copied ${mcp.baseUrl}`),
      () => onToast?.('error', 'Could not copy MCP URL')
    )
  }, [mcp, onToast])

  const brain =
    agent?.provider && agent.provider !== 'heuristic'
      ? agent.model || providerLabel(agent.provider)
      : 'heuristic'

  return (
    <footer className="statusbar" aria-label="Browser status">
      <span className="statusbar-pill" aria-label={`${tabCount} open tabs`}>
        {tabCount} tab{tabCount === 1 ? '' : 's'}
      </span>
      <span className="statusbar-sep" />
      <span
        className={`statusbar-pill statusbar-agent${live ? ' live' : ''}`}
        aria-live="polite"
        aria-label={`Agent ${status}, mode ${mode}`}
      >
        <span className={`agent-status-dot status-${status}`} aria-hidden />
        <strong>{formatStatus(status)}</strong>
        <span className="statusbar-muted"> · {mode}</span>
      </span>
      <span className="statusbar-sep" />
      <span
        className={`statusbar-pill${agent?.provider && agent.provider !== 'heuristic' ? ' live' : ''}`}
        aria-label={`Brain: ${brain}`}
        title={
          agent?.provider && agent.provider !== 'heuristic'
            ? `${providerLabel(agent.provider)}${agent.model ? ` · ${agent.model}` : ''}`
            : 'Heuristic planner (no API key)'
        }
      >
        {brain}
      </span>
      {driver && (
        <>
          <span className="statusbar-sep" />
          <button
            type="button"
            className={`statusbar-btn statusbar-pill${driver.enabled ? ' live' : ''}`}
            title={
              driver.enabled
                ? `${driver.note}\nClick to toggle in-app driver (dom ↔ cdp)`
                : 'CDP off — set BROWGENT_CDP_PORT=9222 and restart'
            }
            aria-label={`Driver ${driver.driverMode}, ${driver.enabled ? `CDP on port ${driver.port}` : 'CDP off'}. Click to toggle.`}
            onClick={cycleDriver}
          >
            drive {driver.driverMode}
            {driver.enabled ? (
              <span className="live"> · :{driver.port}</span>
            ) : (
              <span className="statusbar-muted"> · cdp off</span>
            )}
          </button>
        </>
      )}
      {mcp && (
        <>
          <span className="statusbar-sep" />
          <button
            type="button"
            className={`statusbar-btn statusbar-pill${mcp.enabled ? ' live' : ''}`}
            title={
              mcp.enabled
                ? `${mcp.note}\nClick to copy bridge URL`
                : 'MCP bridge off'
            }
            aria-label={
              mcp.enabled
                ? `MCP bridge on port ${mcp.port}, ${mcp.callCount} calls. Click to copy URL.`
                : 'MCP bridge off'
            }
            onClick={copyMcp}
          >
            mcp
            {mcp.enabled ? (
              <span>
                {' '}
                · :{mcp.port}
                {mcp.callCount > 0 ? ` · ${mcp.callCount}` : ''}
              </span>
            ) : (
              <span className="statusbar-muted"> · off</span>
            )}
          </button>
        </>
      )}
      {activeTab?.owner && (
        <>
          <span className="statusbar-sep" />
          <span
            className={`statusbar-owner owner-${activeTab.owner}`}
            aria-label={`Tab owner: ${activeTab.owner}`}
            title={
              activeTab.owner === 'agent'
                ? 'Agent currently owns this tab'
                : 'You own this tab'
            }
          >
            {activeTab.owner}
          </span>
        </>
      )}
      {host ? (
        <>
          <span className="statusbar-sep" />
          <span
            className="statusbar-host"
            title={statusLabel ?? activeTab?.url}
            aria-label={`Active host: ${host}`}
          >
            {host}
          </span>
        </>
      ) : (
        <span style={{ flex: 1 }} aria-hidden />
      )}
      {onZoomIn && onZoomOut && onZoomReset && activeTab && !statusLabel?.startsWith('browgent://') && (
        <>
          <span className="statusbar-sep" />
          <span className="statusbar-zoom" aria-label={`Zoom ${zoomPct} percent`}>
            <button
              type="button"
              className="statusbar-btn statusbar-zoom-btn"
              title="Zoom out (⌘-)"
              aria-label="Zoom out"
              onClick={onZoomOut}
            >
              −
            </button>
            <button
              type="button"
              className="statusbar-btn statusbar-zoom-pct"
              title="Reset zoom (⌘0)"
              aria-label={`Zoom ${zoomPct} percent. Click to reset.`}
              onClick={onZoomReset}
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              className="statusbar-btn statusbar-zoom-btn"
              title="Zoom in (⌘+)"
              aria-label="Zoom in"
              onClick={onZoomIn}
            >
              +
            </button>
          </span>
        </>
      )}
      <span className="statusbar-version" aria-label={`Browgent version ${appVersion}`}>
        v{appVersion}
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

function formatStatus(status: string): string {
  if (status === 'waiting_human') return 'needs you'
  return status
}
