/**
 * Smoke-test the running Browgent MCP HTTP bridge.
 * Start Browgent first (npm run dev), then: npm run mcp:smoke
 * Token: BROWGENT_MCP_TOKEN or ~/Library/Application Support/browgent/mcp-bridge.json
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
      /* continue */
    }
  }
  return null
}

const token = loadToken()

async function j(path, opts = {}) {
  const headers = {
    Accept: 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}`, 'X-Browgent-Token': token } : {})
  }
  const res = await fetch(`${base}${path}`, { ...opts, headers })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  return { status: res.status, data }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
  console.log('ok:', msg)
}

async function main() {
  console.log(`Probing ${base} … token=${token ? 'yes' : 'NO'}`)
  if (!token) {
    throw new Error('No MCP token — start Browgent once, or set BROWGENT_MCP_TOKEN')
  }

  const health = await j('/health')
  assert(health.status === 200 && health.data.ok === true, 'GET /health')

  const unauth = await fetch(`${base}/v1/status`, { headers: { Accept: 'application/json' } })
  assert(unauth.status === 401, 'GET /v1/status without token is 401')

  const status = await j('/v1/status')
  assert(status.status === 200 && status.data.enabled === true, 'GET /v1/status enabled')
  assert(Array.isArray(status.data.tools) && status.data.tools.length > 0, 'status has tools')

  const tools = await j('/v1/tools')
  assert(tools.status === 200 && tools.data.tools?.length > 0, 'GET /v1/tools')

  const list = await j('/v1/tools/call', {
    method: 'POST',
    body: JSON.stringify({ name: 'list_tabs', arguments: {} })
  })
  assert(list.status === 200 && list.data.ok === true, 'POST list_tabs')
  assert(Array.isArray(list.data.data?.tabs), 'list_tabs returns tabs')

  const nav = await j('/v1/tools/call', {
    method: 'POST',
    body: JSON.stringify({ name: 'navigate', arguments: { url: 'https://example.com' } })
  })
  // may be 200 or 422 depending on confirm policy / load
  assert(nav.status === 200 || nav.status === 422, `navigate responded (${nav.status})`)
  console.log('navigate:', nav.data.summary || nav.data.error)

  const url = await j('/v1/tools/call', {
    method: 'POST',
    body: JSON.stringify({ name: 'get_url', arguments: {} })
  })
  assert(url.status === 200 && url.data.ok === true, 'get_url')
  console.log('url:', url.data.data)

  console.log('\nMCP bridge smoke passed')
}

main().catch((e) => {
  console.error('\nMCP bridge smoke FAILED:', e.message)
  console.error('Is Browgent running? npm run dev')
  process.exit(1)
})
