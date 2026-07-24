#!/usr/bin/env node
/**
 * Build a YC / investor usage-instrumentation packet on disk (no secrets).
 * This is usage instrumentation "ready to fill" — NOT a traction claim.
 * Numbers come from local, opt-in metrics and may legitimately be zero.
 * Usage: npm run yc:packet
 * Output: release/yc-traction-packet.json + prints application bullets
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function git(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function loadLocalMetrics() {
  const candidates = [
    join(homedir(), 'Library/Application Support/browgent/metrics.json'),
    join(homedir(), 'Library/Application Support/Browgent/metrics.json'),
    join(homedir(), '.config/browgent/metrics.json'),
    join(homedir(), 'AppData/Roaming/browgent/metrics.json')
  ]
  for (const f of candidates) {
    try {
      if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
    } catch {
      /* */
    }
  }
  return null
}

const metrics = loadLocalMetrics()
const lastTag = git('git describe --tags --abbrev=0')
const branch = git('git branch --show-current')

const packet = {
  schemaVersion: 1,
  format: 'browgent.yc-packet',
  kind: 'usage-instrumentation',
  disclaimer:
    'Usage instrumentation, ready to fill — not a traction claim. Metrics are local + opt-in and may legitimately be zero until real users arrive.',
  generatedAt: new Date().toISOString(),
  product: {
    name: 'Browgent',
    version: pkg.version,
    oneLiner:
      'An AI agent working inside your real, logged-in browser — with you one click from taking the wheel. Local-first, open-source co-browse runtime with MCP + Playwright attach.',
    repo: pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') || pkg.homepage
  },
  build: {
    branch,
    lastTag,
    scripts: ['mcp', 'mcp:smoke', 'demo:hero', 'dist:mac', 'dist:win', 'dist:linux']
  },
  usageInstrumentation: metrics,
  applicationFillIn: {
    progress:
      'Fill from real signal as it arrives: weekly active installs, MCP sessions, design-partner quotes, GitHub Release download counts.',
    demoVideo: 'Record the hero flow documented in docs/builders.md; npm run demo:hero for automated B-roll.',
    whyYou: 'Founder-market fit — fill personally.'
  },
  checklist: [
    'docs/yc-application.md filled',
    'Demo video uploaded (unlisted)',
    'At least one design partner quote',
    'Releases: mac (+ win/linux if possible)',
    'npm run demo:hero passes',
    'Landing + builders.md linked from README'
  ]
}

const outDir = join(root, 'release')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'yc-traction-packet.json')
writeFileSync(outPath, JSON.stringify(packet, null, 2))

console.log('YC usage-instrumentation packet →', outPath)
console.log('(usage instrumentation, ready to fill — not a traction claim)')
console.log('\n— Progress bullets (edit before paste) —')
if (metrics) {
  console.log(
    `• ${metrics.appLaunchCount ?? 0} launches · ${metrics.agentRunCount ?? 0} agent runs · ${metrics.mcpCallCount ?? 0} MCP calls · ${metrics.demoRunCount ?? 0} demos (local, opt-in)`
  )
} else {
  console.log('• (no local metrics.json yet — run the app to start capturing usage)')
}
console.log(`• Open source co-browse runtime v${pkg.version} · MCP + Playwright attach`)
console.log('• See docs/yc-application.md for full answer drafts')
