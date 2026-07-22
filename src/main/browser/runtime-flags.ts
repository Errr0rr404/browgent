/**
 * Process-level runtime flags (env + CLI). Resolved once before app ready.
 *
 *   BROWGENT_CDP_PORT=9222     enable CDP (0 = off)
 *   BROWGENT_CDP=0|1           shorthand; default on with port 9222
 *   BROWGENT_DRIVER=dom|cdp    in-app agent actuation path
 *   BROWGENT_AGENT_ONLY=1      compact window, CDP on, ready for automation
 *   BROWGENT_HEADLESS=1        hide window (still runs Chromium + CDP)
 *
 * CLI: --cdp-port=9222 --driver=cdp --agent-only --headless
 */

import { parseDriverMode, type DriverMode } from '../../shared/driver'

export interface RuntimeFlags {
  cdpPort: number | null
  driverMode: DriverMode
  agentOnly: boolean
  headless: boolean
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`
  for (const a of process.argv) {
    if (a.startsWith(prefix)) return a.slice(prefix.length)
  }
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('-')) {
    return process.argv[idx + 1]
  }
  if (process.argv.includes(`--${name}`)) return '1'
  return undefined
}

function truthy(v: string | undefined): boolean {
  if (v == null || v === '') return false
  const s = v.toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

function parsePort(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null
  if (raw === '0' || raw.toLowerCase() === 'off' || raw.toLowerCase() === 'false') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return null
  return Math.floor(n)
}

export function resolveRuntimeFlags(): RuntimeFlags {
  const agentOnly = truthy(process.env.BROWGENT_AGENT_ONLY) || truthy(argValue('agent-only'))
  const headless = truthy(process.env.BROWGENT_HEADLESS) || truthy(argValue('headless'))

  const cdpEnv =
    process.env.BROWGENT_CDP_PORT ??
    process.env.BROWGENT_CDP ??
    argValue('cdp-port') ??
    argValue('cdp')

  let cdpPort: number | null
  if (cdpEnv === undefined) {
    // Default ON for Playwright-friendliness (localhost only). Disable with BROWGENT_CDP=0
    cdpPort = 9222
  } else if (cdpEnv === '1' || cdpEnv.toLowerCase() === 'true' || cdpEnv.toLowerCase() === 'on') {
    cdpPort = 9222
  } else {
    cdpPort = parsePort(cdpEnv)
  }

  // Agent-only / headless imply CDP so external tools can attach
  if ((agentOnly || headless) && cdpPort == null) {
    cdpPort = 9222
  }

  const driverRaw =
    process.env.BROWGENT_DRIVER ?? argValue('driver') ?? (agentOnly ? 'cdp' : 'dom')
  const driverMode = parseDriverMode(driverRaw)

  return { cdpPort, driverMode, agentOnly, headless }
}

let cached: RuntimeFlags | null = null

export function getRuntimeFlags(): RuntimeFlags {
  if (!cached) cached = resolveRuntimeFlags()
  return cached
}

/** Allow UI / IPC to flip in-app driver without restart (CDP port still needs restart). */
export function setDriverMode(mode: DriverMode): void {
  const f = getRuntimeFlags()
  cached = { ...f, driverMode: mode }
}
