/**
 * CDP endpoint for Playwright / Chrome DevTools Protocol clients.
 *
 * Uses Chromium `--remote-debugging-port` so external tools can:
 *   const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
 *
 * Guest tabs (partition persist:browgent-pages) appear as page targets.
 * Bind is localhost-only (Chromium default).
 */

import { app, net } from 'electron'
import type { CdpEndpointStatus, DriverMode } from '../../shared/driver'
import { getRuntimeFlags } from './runtime-flags'

export interface CdpApplyResult {
  enabled: boolean
  port: number | null
}

/**
 * Must run before app.ready. Enables Chromium remote debugging.
 */
export function applyCdpCommandLine(): CdpApplyResult {
  const { cdpPort } = getRuntimeFlags()
  if (cdpPort == null) {
    return { enabled: false, port: null }
  }

  app.commandLine.appendSwitch('remote-debugging-port', String(cdpPort))
  // Localhost Playwright attach only — avoid wildcard origins
  app.commandLine.appendSwitch(
    'remote-allow-origins',
    `http://127.0.0.1:${cdpPort},http://localhost:${cdpPort}`
  )

  return { enabled: true, port: cdpPort }
}

export function getCdpBrowserURL(): string | null {
  const { cdpPort } = getRuntimeFlags()
  if (cdpPort == null) return null
  return `http://127.0.0.1:${cdpPort}`
}

interface JsonVersion {
  webSocketDebuggerUrl?: string
  Browser?: string
}

/**
 * Probe /json/version on the local CDP port (best-effort after Chromium is up).
 */
export async function discoverWebSocketDebuggerUrl(
  timeoutMs = 800
): Promise<string | null> {
  const base = getCdpBrowserURL()
  if (!base) return null

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    try {
      const request = net.request({ url: `${base}/json/version`, method: 'GET' })
      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          clearTimeout(timer)
          try {
            const json = JSON.parse(body) as JsonVersion
            resolve(json.webSocketDebuggerUrl ?? null)
          } catch {
            resolve(null)
          }
        })
      })
      request.on('error', () => {
        clearTimeout(timer)
        resolve(null)
      })
      request.end()
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

let lastWs: string | null = null

export async function getCdpStatus(driverMode?: DriverMode): Promise<CdpEndpointStatus> {
  const flags = getRuntimeFlags()
  const enabled = flags.cdpPort != null
  const browserURL = getCdpBrowserURL()
  let webSocketDebuggerUrl: string | null = lastWs

  if (enabled) {
    const ws = await discoverWebSocketDebuggerUrl()
    if (ws) {
      lastWs = ws
      webSocketDebuggerUrl = ws
    }
  }

  const mode = driverMode ?? flags.driverMode

  return {
    enabled,
    browserURL,
    webSocketDebuggerUrl,
    port: flags.cdpPort,
    driverMode: mode,
    agentOnly: flags.agentOnly,
    headless: flags.headless,
    note: enabled
      ? `Playwright: chromium.connectOverCDP('${browserURL}'). In-app agent driver: ${mode}.`
      : 'CDP off (set BROWGENT_CDP_PORT=9222). In-app agent uses DOM inject only.'
  }
}
