/**
 * Privacy-safe local metrics (no page contents, URLs, or prompts).
 * Opt-in remote flush only when BROWGENT_TELEMETRY_URL is set AND user opts in.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { platform } from 'os'
import type { LocalMetrics, TractionPacket } from '../../shared/metrics'

export type { LocalMetrics, TractionPacket }

const FILE = 'metrics.json'

function path(): string {
  return join(app.getPath('userData'), FILE)
}

function empty(): LocalMetrics {
  return {
    installId: randomUUID(),
    createdAt: new Date().toISOString(),
    version: app.getVersion(),
    platform: process.platform,
    telemetryOptIn: false,
    agentRunCount: 0,
    mcpCallCount: 0,
    trajectoryExportCount: 0,
    appLaunchCount: 0,
    demoRunCount: 0,
    recipeRunCount: 0,
    lastLaunchAt: null,
    lastAgentRunAt: null,
    lastMcpCallAt: null,
    lastDemoAt: null
  }
}

function load(): LocalMetrics {
  try {
    const p = path()
    if (!existsSync(p)) return empty()
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<LocalMetrics>
    const base = empty()
    return {
      ...base,
      ...raw,
      installId: typeof raw.installId === 'string' ? raw.installId : base.installId,
      version: app.getVersion(),
      platform: process.platform,
      demoRunCount: Number(raw.demoRunCount) || 0,
      recipeRunCount: Number(raw.recipeRunCount) || 0
    }
  } catch {
    return empty()
  }
}

function save(m: LocalMetrics): void {
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path(), JSON.stringify(m, null, 2), { mode: 0o600 })
  } catch {
    // ignore disk errors
  }
}

let cached: LocalMetrics | null = null

export function getMetrics(): LocalMetrics {
  if (!cached) cached = load()
  cached.version = app.getVersion()
  return { ...cached }
}

export function setTelemetryOptIn(on: boolean): LocalMetrics {
  const m = getMetrics()
  m.telemetryOptIn = !!on
  cached = m
  save(m)
  return getMetrics()
}

export function recordLaunch(): void {
  const m = getMetrics()
  m.appLaunchCount += 1
  m.lastLaunchAt = new Date().toISOString()
  cached = m
  save(m)
  void maybeFlushRemote(m)
}

export function recordAgentRun(): void {
  const m = getMetrics()
  m.agentRunCount += 1
  m.lastAgentRunAt = new Date().toISOString()
  cached = m
  save(m)
}

export function recordMcpCall(): void {
  const m = getMetrics()
  m.mcpCallCount += 1
  m.lastMcpCallAt = new Date().toISOString()
  cached = m
  save(m)
}

export function recordTrajectoryExport(): void {
  const m = getMetrics()
  m.trajectoryExportCount += 1
  cached = m
  save(m)
}

export function recordDemoRun(): void {
  const m = getMetrics()
  m.demoRunCount += 1
  m.lastDemoAt = new Date().toISOString()
  cached = m
  save(m)
}

export function recordRecipeRun(): void {
  const m = getMetrics()
  m.recipeRunCount += 1
  cached = m
  save(m)
}

export function buildTractionPacket(): TractionPacket {
  const m = getMetrics()
  const created = Date.parse(m.createdAt)
  const daysSinceInstall = Number.isFinite(created)
    ? Math.max(0, Math.floor((Date.now() - created) / 86_400_000))
    : 0
  const agentRunsPerLaunch =
    m.appLaunchCount > 0 ? Math.round((m.agentRunCount / m.appLaunchCount) * 100) / 100 : 0
  const activity = m.agentRunCount + m.mcpCallCount
  const mcpShareOfActivity =
    activity > 0 ? Math.round((m.mcpCallCount / activity) * 1000) / 10 : 0

  return {
    schemaVersion: 1,
    format: 'browgent.traction',
    generatedAt: new Date().toISOString(),
    product: {
      name: 'Browgent',
      oneLiner:
        'Local co-browse runtime: humans and agents share real Chromium tabs with policy, takeover, MCP, and Playwright.',
      version: m.version,
      repo: 'https://github.com/Errr0rr404/browgent'
    },
    metrics: m,
    derived: {
      daysSinceInstall,
      agentRunsPerLaunch,
      mcpShareOfActivity
    },
    notes: [
      'No page contents, URLs, or prompts are collected.',
      'Fill design-partner quotes and download counts manually before Demo Day.',
      'Paste metrics into the YC application Progress section; attach demo video separately.'
    ]
  }
}

/** Only https:// public endpoints — blocks SSRF to localhost/metadata. */
function isSafeTelemetryUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host === 'metadata.google.internal' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.startsWith('169.254.')
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

async function maybeFlushRemote(m: LocalMetrics): Promise<void> {
  if (!m.telemetryOptIn) return
  const url = process.env.BROWGENT_TELEMETRY_URL?.trim()
  if (!url || !isSafeTelemetryUrl(url)) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'browgent.heartbeat',
        installId: m.installId,
        version: m.version,
        platform: m.platform || platform(),
        agentRunCount: m.agentRunCount,
        mcpCallCount: m.mcpCallCount,
        trajectoryExportCount: m.trajectoryExportCount,
        appLaunchCount: m.appLaunchCount,
        demoRunCount: m.demoRunCount,
        recipeRunCount: m.recipeRunCount,
        ts: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(4000)
    })
  } catch {
    // ignore
  }
}
