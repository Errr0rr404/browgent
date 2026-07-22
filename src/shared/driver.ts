/**
 * Dual driver model:
 * - `dom`  — fast path: inject observe/act scripts into the guest page (default for in-app agent)
 * - `cdp`  — Playwright-compatible path: Chrome DevTools Protocol (remote-debugging + debugger)
 *
 * External Playwright attaches via CDP endpoint regardless of in-app driver mode.
 */

export type DriverMode = 'dom' | 'cdp'

export interface CdpEndpointStatus {
  /** True when Chromium remote-debugging-port is active */
  enabled: boolean
  /** Localhost HTTP endpoint Playwright uses: connectOverCDP(browserURL) */
  browserURL: string | null
  /** WebSocket debugger URL when discovered */
  webSocketDebuggerUrl: string | null
  port: number | null
  /** How the in-app agent actuates pages */
  driverMode: DriverMode
  /** Lightweight shell (minimal chrome / optional hidden window) */
  agentOnly: boolean
  /** Window not shown (automation / CI) */
  headless: boolean
  note: string
}

export function parseDriverMode(raw: string | undefined | null): DriverMode {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'cdp' || v === 'playwright' || v === 'devtools') return 'cdp'
  return 'dom'
}
