#!/usr/bin/env node
/**
 * Automated hero demo over the MCP bridge (recordable for YC video B-roll).
 *
 * Prerequisites:
 *   1. Browgent running (npm run dev) — MCP on :17342 with token
 *   2. node scripts/demo-hero.mjs
 *
 * Writes: release/demo-last-run.json (release/ is gitignored)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const base = (process.env.BROWGENT_MCP_URL || 'http://127.0.0.1:17342').replace(/\/$/, '')

function loadToken() {
  if (process.env.BROWGENT_MCP_TOKEN?.trim()) return process.env.BROWGENT_MCP_TOKEN.trim()
  const candidates = [
    join(homedir(), 'Library/Application Support/browgent/mcp-bridge.json'),
    join(homedir(), 'Library/Application Support/Browgent/mcp-bridge.json'),
    join(homedir(), '.config/browgent/mcp-bridge.json'),
    join(homedir(), 'AppData/Roaming/browgent/mcp-bridge.json')
  ]
  for (const f of candidates) {
    try {
      if (existsSync(f)) {
        const j = JSON.parse(readFileSync(f, 'utf8'))
        if (j.token) return String(j.token)
      }
    } catch {
      /* */
    }
  }
  return null
}

const token = loadToken()

async function call(name, args = {}) {
  const res = await fetch(`${base}/v1/tools/call`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token
        ? { Authorization: `Bearer ${token}`, 'X-Browgent-Token': token }
        : {})
    },
    body: JSON.stringify({ name, arguments: args })
  })
  const data = await res.json()
  return { status: res.status, data }
}

function step(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  return { label, ok, detail: detail ?? null, at: new Date().toISOString() }
}

async function main() {
  if (!token) {
    console.error('No MCP token. Start Browgent once or set BROWGENT_MCP_TOKEN.')
    process.exit(1)
  }

  const started = Date.now()
  const log = []
  console.log(`Hero demo → ${base}\n`)

  // Raw Node fetch throws (ECONNREFUSED) when the app isn't running — catch it and
  // print a clear hint instead of dumping a stack. Mirrors scripts/mcp-bridge-smoke.mjs.
  let health
  try {
    health = await fetch(`${base}/health`)
  } catch (e) {
    console.error(`Cannot reach Browgent bridge at ${base}. Start Browgent first: npm run dev`)
    console.error(`  ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
  const healthOk = health.ok
  log.push(step('health', healthOk, String(health.status)))
  if (!healthOk) {
    console.error('Bridge health check failed. Start Browgent first: npm run dev')
    process.exit(1)
  }

  // Open our own tab first for a deterministic starting point — without it, navigate
  // hard-fails with "No active tab" on a clean launch.
  let r = await call('new_tab', {})
  log.push(step('new_tab', r.data.ok === true, r.data.summary || r.data.error))

  r = await call('list_tabs')
  log.push(step('list_tabs', r.data.ok === true, r.data.summary))

  r = await call('navigate', { url: 'https://example.com' })
  log.push(step('navigate example.com', r.data.ok === true, r.data.summary || r.data.error))

  r = await call('observe', {})
  log.push(step('observe', r.data.ok === true, r.data.summary))

  r = await call('extract_text', { maxChars: 500 })
  log.push(step('extract_text', r.data.ok === true, r.data.summary))

  r = await call('get_url', {})
  const url = r.data?.data?.url || ''
  log.push(step('get_url', r.data.ok === true && /example\.com/i.test(String(url)), url))

  r = await call('list_tabs')
  log.push(step('list_tabs (final)', r.data.ok === true, r.data.summary))

  const passed = log.every((s) => s.ok)
  const out = {
    schemaVersion: 1,
    format: 'browgent.hero-demo',
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    passed,
    steps: log,
    note: 'Automated MCP path for co-browse demo. Record UI with Takeover for full YC video.'
  }

  // Write under release/ (gitignored) so the demo never leaves an untracked file in the repo.
  const outPath = join(root, 'release', 'demo-last-run.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`\n${passed ? 'PASS' : 'FAIL'} · ${out.durationMs}ms · wrote ${outPath}`)
  process.exit(passed ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
