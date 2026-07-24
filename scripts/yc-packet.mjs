#!/usr/bin/env node
/**
 * Build a YC / investor traction packet on disk (no secrets).
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
const commits = git('git rev-list --count HEAD')
const lastTag = git('git describe --tags --abbrev=0')
const branch = git('git branch --show-current')

const packet = {
  schemaVersion: 1,
  format: 'browgent.yc-packet',
  generatedAt: new Date().toISOString(),
  product: {
    name: 'Browgent',
    version: pkg.version,
    oneLiner:
      'Local co-browse runtime where humans and agents share real Chromium tabs — policy, takeover, MCP, Playwright.',
    repo: pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') || pkg.homepage
  },
  engineering: {
    branch,
    commitCount: commits ? Number(commits) : null,
    lastTag,
    scripts: ['mcp', 'mcp:smoke', 'demo:hero', 'dist:mac', 'dist:win', 'dist:linux']
  },
  localMetrics: metrics,
  applicationFillIn: {
    progress:
      'Replace with: weekly users, MCP sessions, design-partner quotes, download counts from GitHub Releases.',
    demoVideo: 'Record using docs/hero-demo.md + npm run demo:hero for B-roll.',
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

console.log('YC traction packet →', outPath)
console.log('\n— Progress bullets (edit before paste) —')
if (metrics) {
  console.log(
    `• ${metrics.appLaunchCount} launches · ${metrics.agentRunCount} agent runs · ${metrics.mcpCallCount} MCP calls · ${metrics.demoRunCount ?? 0} demos`
  )
} else {
  console.log('• (no local metrics.json yet — run the app)')
}
console.log(`• Open source co-browse runtime v${pkg.version} · MCP + Playwright attach`)
console.log('• See docs/yc-application.md for full answer drafts')
