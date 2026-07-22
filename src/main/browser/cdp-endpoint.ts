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

const CDP_PROBE_TIMEOUT_MS = 800
const CDP_PROBE_MAX_BODY_BYTES = 64 * 1024

/**
 * Probe /json/version on the local CDP port (best-effort after Chromium is up).
 */
export async function discoverWebSocketDebuggerUrl(
  timeoutMs = CDP_PROBE_TIMEOUT_MS
): Promise<string | null> {
  const base = getCdpBrowserURL()
  if (!base) return null

  return new Promise((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | null = null
    let request: Electron.ClientRequest | null = null

    const finish = (value: string | null, success: boolean): void => {
      if (settled) return
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (!success) {
        try {
          request?.abort()
        } catch {
          // ignore
        }
      }
      request = null
      resolve(value)
    }

    timer = setTimeout(() => finish(null, false), timeoutMs)

    try {
      request = net.request({ url: `${base}/json/version`, method: 'GET' })
    } catch {
      finish(null, false)
      return
    }

    let bytes = 0
    let body = ''

    request.on('response', (response) => {
      const status = response.statusCode ?? 0
      if (status < 200 || status >= 300) {
        finish(null, false)
        return
      }
      let responseDone = false
      const onData = (chunk: Buffer | string): void => {
        if (settled || responseDone) return
        const size = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
        bytes += size
        if (bytes > CDP_PROBE_MAX_BODY_BYTES) {
          responseDone = true
          finish(null, false)
          return
        }
        body += typeof chunk === 'string' ? chunk : chunk.toString()
      }
      const onEnd = (): void => {
        if (settled || responseDone) return
        responseDone = true
        try {
          const json = JSON.parse(body) as JsonVersion
          finish(json.webSocketDebuggerUrl ?? null, true)
        } catch {
          finish(null, false)
        }
      }
      response.on('data', onData)
      response.on('end', onEnd)
      response.on('error', () => {
        if (settled || responseDone) return
        responseDone = true
        finish(null, false)
      })
    })
    request.on('error', () => finish(null, false))
    request.on('abort', () => finish(null, false))
    request.on('close', () => finish(null, false))

    try {
      request.end()
    } catch {
      finish(null, false)
    }
  })
}

export async function getCdpStatus(driverMode?: DriverMode): Promise<CdpEndpointStatus> {
  const flags = getRuntimeFlags()
  const enabled = flags.cdpPort != null
  const browserURL = getCdpBrowserURL()
  let webSocketDebuggerUrl: string | null = null

  if (enabled) {
    webSocketDebuggerUrl = await discoverWebSocketDebuggerUrl()
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
